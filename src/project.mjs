import { join } from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { action, atomicWrite, exists, readJson, run } from './util.mjs';
import { renderManagedBlock, mergeManagedBlock } from './managed.mjs';
import { detectProfiles, profileInstructions, projectName } from './profiles.mjs';
import { kitRoot, presetComponents, validateCatalog } from './manifest.mjs';
import { beginTransaction, copyTracked, finishTransaction, listTransactions, pathHash, removeTracked, replaceTracked, rollbackTransaction, withLock, writeTracked } from './transaction.mjs';
import { deriveProjectKey } from './obsidian.mjs';

const configPath = (root) => join(root, '.codex-kit', 'config.json');
const statePath = (root) => join(root, '.codex-kit', 'state.json');

export async function findProjectRoot(start = process.cwd()) {
  const result = run('git', ['-C', start, 'rev-parse', '--show-toplevel']);
  if (result.status !== 0) throw new Error('Codex Kit project commands require a Git repository.');
  return result.stdout.trim();
}

async function desiredConfig(root, preset) {
  const existing = await readJson(configPath(root), null);
  if (existing?.schemaVersion === 2) return existing;
  const legacy = await readJson(statePath(root), null);
  if (legacy?.schemaVersion === 1) return { schemaVersion: 2, preset: 'minimal', profiles: { mode: 'auto', include: legacy.profiles ?? [], exclude: [] }, components: { include: legacy.components ?? [], exclude: [] }, features: { enrichment: false }, tools: { graphify: { install: false, build: false, hooks: false }, obsidian: {} }, migratedFrom: 1 };
  return { schemaVersion: 2, preset, profiles: { mode: 'auto', include: [], exclude: [] }, components: { include: [], exclude: [] }, features: { enrichment: false }, tools: { graphify: { install: false, build: false, hooks: false }, obsidian: {} } };
}

async function resolveProfiles(detection, config) {
  const excluded = new Set(config.profiles?.exclude ?? []);
  const { manifest } = await validateCatalog();
  const resolved = [];
  const include = (id) => {
    if (excluded.has(id) || resolved.includes(id)) return;
    for (const dependency of manifest.profiles[id]?.requires ?? []) include(dependency);
    resolved.push(id);
  };
  for (const id of ['generic', ...(config.profiles?.mode === 'auto' ? detection.profiles : []), ...(config.profiles?.include ?? [])]) include(id);
  return resolved;
}

async function resolveComponents(config) {
  const preset = await presetComponents(config.preset);
  const excluded = new Set(config.components?.exclude ?? []);
  const { manifest } = await validateCatalog();
  return [...new Set([...preset, ...(config.components?.include ?? [])])].filter((id) => manifest.components[id]?.scope.includes('project') && !excluded.has(id));
}

async function projectAssets(components, config) {
  const { manifest } = await validateCatalog();
  return components.flatMap((component) => {
    if (component === 'graphify' && !config.tools?.graphify?.install) return [];
    return (manifest.components[component]?.assets ?? []).map((asset) => ({ component, ...asset }));
  });
}

export async function projectPlan({ root, preset = 'developer', requestedConfig }) {
  const projectRoot = await findProjectRoot(root);
  const config = requestedConfig ?? await desiredConfig(projectRoot, preset);
  const detection = await detectProfiles(projectRoot);
  const [profiles, components] = [await resolveProfiles(detection, config), await resolveComponents(config)];
  if (components.includes('obsidian-brain')) {
    config.tools ??= {};
    config.tools.obsidian ??= {};
    const key = await deriveProjectKey({ root: projectRoot, existing: config.tools.obsidian.projectKey, allocate: false });
    if (key) config.tools.obsidian.projectKey = key;
    else delete config.tools.obsidian.projectKey;
  }
  const instructions = await profileInstructions(profiles);
  const assets = await projectAssets(components, config);
  const actions = [
    action('planned', 'detect project profiles', profiles.join(', ')),
    action('planned', `manage ${join(projectRoot, 'AGENTS.md')}`, 'bounded Codex Kit marker block', { scope: 'project', reversibility: 'full' }),
    action('planned', `write ${configPath(projectRoot)}`, 'committed desired setup', { scope: 'project', reversibility: 'full' }),
    action('planned', `write ${statePath(projectRoot)}`, 'runtime receipt', { scope: 'project', reversibility: 'full' })
  ];
  actions.push(action('recommended', 'use Graphify', detection.graphifyRecommended ? 'strongly recommended for this repository; adapter/build/hooks remain opt-in' : 'recommended for structural context; adapter/build/hooks remain opt-in'));
  if (detection.frameworkConflict) actions.push(action('conflict', 'Spring and Quarkus detected', 'confirm the intended framework before applying.'));
  for (const component of [...new Set(assets.map((asset) => asset.component).filter((id) => id !== 'graphify'))]) actions.push(action('planned', `provision ${component}`, 'portable project assets', { reversibility: 'full' }));
  actions.push(action(config.tools?.graphify?.install ? 'planned' : 'skipped', 'provision Graphify setup', config.tools?.graphify?.install ? 'copies the explicit setup adapter; build and hooks remain separate' : 'enable tools.graphify.install in project config to provision'));
  return { status: detection.frameworkConflict ? 'conflict' : 'ok', project: await projectName(projectRoot), root: projectRoot, config, profiles, components, instructions, assets, graphifyRecommended: detection.graphifyRecommended, actions };
}

export async function applyProject(plan) {
  if (plan.status === 'conflict') return plan;
  if (plan.components.includes('obsidian-brain') && !plan.config.tools?.obsidian?.projectKey) {
    plan.config.tools ??= {};
    plan.config.tools.obsidian ??= {};
    plan.config.tools.obsidian.projectKey = await deriveProjectKey({ root: plan.root, existing: null, allocate: true });
    plan.actions.push(action('planned', 'allocate Obsidian project namespace', 'collision-resistant project key'));
  }
  return withLock(plan.root, async () => {
    const transaction = await beginTransaction(plan.root, 'project');
    try {
      const previousState = await readJson(statePath(plan.root), { assets: [] });
      const previousAssets = new Map((previousState.assets ?? []).map((asset) => [asset.target, asset]));
      const agentsPath = join(plan.root, 'AGENTS.md');
      const original = exists(agentsPath) ? await readFile(agentsPath, 'utf8') : '';
      const block = renderManagedBlock({ profiles: plan.profiles, components: plan.components, instructions: plan.instructions });
      await writeTracked(transaction, agentsPath, mergeManagedBlock(original, block));
      await writeTracked(transaction, configPath(plan.root), `${JSON.stringify(plan.config, null, 2)}\n`);
      const installedAssets = [];
      const assetActions = [];
      for (const asset of plan.assets ?? await projectAssets(plan.components, plan.config)) {
        const source = join(kitRoot, asset.source);
        const destination = join(plan.root, asset.target);
        const sourceHash = await pathHash(source);
        if (exists(destination)) {
          const destinationHash = await pathHash(destination);
          const previous = previousAssets.get(asset.target);
          if (previous?.hash === destinationHash) {
            if (destinationHash !== sourceHash) {
              await replaceTracked(transaction, source, destination);
              installedAssets.push({ component: asset.component, target: asset.target, hash: sourceHash });
              assetActions.push(action('changed', `update ${asset.target}`, asset.component));
            } else {
              installedAssets.push({ component: asset.component, target: asset.target, hash: destinationHash });
              assetActions.push(action('unchanged', `provision ${asset.target}`, 'already matches Codex Kit'));
            }
          } else {
            assetActions.push(action(destinationHash === sourceHash ? 'unchanged' : 'conflict', `provision ${asset.target}`, destinationHash === sourceHash ? 'matching existing content preserved as user-owned' : 'existing user content preserved'));
          }
          continue;
        }
        await copyTracked(transaction, source, destination);
        installedAssets.push({ component: asset.component, target: asset.target, hash: sourceHash });
        assetActions.push(action('changed', `provision ${asset.target}`, asset.component));
      }
      const desiredTargets = new Set((plan.assets ?? []).map((asset) => asset.target));
      for (const previous of previousAssets.values()) if (!desiredTargets.has(previous.target)) {
        const destination = join(plan.root, previous.target);
        if (!exists(destination)) continue;
        if (await pathHash(destination) !== previous.hash) {
          assetActions.push(action('conflict', `remove ${previous.target}`, 'modified content preserved'));
          continue;
        }
        await removeTracked(transaction, destination);
        assetActions.push(action('changed', `remove ${previous.target}`, 'component no longer selected'));
      }
      await writeTracked(transaction, statePath(plan.root), `${JSON.stringify({ schemaVersion: 2, profiles: plan.profiles, components: plan.components, assets: installedAssets, updatedAt: new Date().toISOString() }, null, 2)}\n`);
      const receipt = await finishTransaction(transaction);
      return { ...plan, status: assetActions.some((item) => item.state === 'conflict') ? 'partial' : 'ok', transactionId: receipt.id, actions: [...plan.actions.map((item) => item.state === 'planned' ? { ...item, state: 'changed' } : item), ...assetActions] };
    } catch (error) {
      const receipt = await finishTransaction(transaction, 'failed');
      await rollbackTransaction(plan.root, receipt.id);
      throw error;
    }
  });
}

export async function initProject(options) { const plan = await projectPlan(options); return options.execute ? applyProject(plan) : plan; }

export async function modifyProject({ root, component, remove = false, execute = false }) {
  const projectRoot = await findProjectRoot(root);
  const { manifest } = await validateCatalog();
  if (!manifest.components[component] || !manifest.components[component].scope.includes('project')) throw new Error(`Unknown or non-project component: ${component}`);
  const config = await desiredConfig(projectRoot, 'developer');
  const key = remove ? 'exclude' : 'include';
  config.components[key] = [...new Set([...(config.components[key] ?? []), component])];
  const opposite = remove ? 'include' : 'exclude';
  config.components[opposite] = (config.components[opposite] ?? []).filter((id) => id !== component);
  if (remove && component === 'graphify') {
    config.tools ??= {};
    config.tools.graphify ??= {};
    config.tools.graphify.install = false;
  }
  const plan = await projectPlan({ root: projectRoot, preset: config.preset, requestedConfig: config });
  return execute ? applyProject(plan) : plan;
}

export async function projectStatus(root) {
  const projectRoot = await findProjectRoot(root);
  return { status: 'ok', root: projectRoot, config: await readJson(configPath(projectRoot), null), transactions: await listTransactions(projectRoot), actions: [action('unchanged', 'read project state')] };
}

export async function rollbackProject(root, transactionId) {
  const projectRoot = await findProjectRoot(root);
  return withLock(projectRoot, () => rollbackTransaction(projectRoot, transactionId));
}

export function doctor() {
  const checks = [
    { label: 'Node', command: process.execPath },
    { label: 'Git', command: 'git' },
    { label: 'Codex CLI', command: 'codex' },
    { label: 'GitHub CLI', command: 'gh' },
    { label: 'Obsidian CLI (optional)', command: 'obsidian', args: ['version'], optional: true },
  ];
  const actions = checks.map(({ label, command, args = ['--version'], optional = false }) => {
    const result = command === process.execPath ? { status: 0, stdout: process.version } : run(command, args);
    return action(result.status === 0 ? 'ready' : optional ? 'recommended' : 'warning', label, (result.stdout || result.stderr || result.error || '').trim().split(/\r?\n/)[0]);
  });
  return { status: actions.some((item) => item.state === 'warning') ? 'partial' : 'ok', actions };
}

export async function projectDiff(plan) {
  const agentsPath = join(plan.root, 'AGENTS.md');
  const before = exists(agentsPath) ? await readFile(agentsPath, 'utf8') : '';
  const block = renderManagedBlock({ profiles: plan.profiles, components: plan.components, instructions: plan.instructions });
  const after = mergeManagedBlock(before, block);
  const temp = await mkdtemp(join(tmpdir(), 'codex-kit-diff-'));
  try {
    await writeFile(join(temp, 'before'), before); await writeFile(join(temp, 'after'), after);
    const result = run('git', ['diff', '--no-index', '--no-color', join(temp, 'before'), join(temp, 'after')]);
    return { ...plan, diff: result.stdout || `${before}\n---\n${after}`, actions: [...plan.actions, action('planned', 'render diff')] };
  } finally { await rm(temp, { recursive: true, force: true }); }
}
