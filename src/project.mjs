import { join } from 'node:path';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { action, atomicWrite, exists, readJson, run } from './util.mjs';
import { renderManagedBlock, mergeManagedBlock } from './managed.mjs';
import { detectProfiles, profileInstructions, projectName } from './profiles.mjs';
import { kitRoot, presetComponents, validateCatalog } from './manifest.mjs';
import { beginTransaction, finishTransaction, listTransactions, pathHash, rollbackTransaction, withLock, writeTracked } from './transaction.mjs';

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
  if (legacy?.schemaVersion === 1) return { schemaVersion: 2, preset: 'minimal', profiles: { mode: 'auto', include: legacy.profiles ?? [], exclude: [] }, components: { include: legacy.components ?? [], exclude: [] }, features: { enrichment: false }, tools: { graphify: { install: false, build: false, hooks: false } }, migratedFrom: 1 };
  return { schemaVersion: 2, preset, profiles: { mode: 'auto', include: [], exclude: [] }, components: { include: [], exclude: [] }, features: { enrichment: false }, tools: { graphify: { install: false, build: false, hooks: false } } };
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
  return [...new Set([...preset, ...(config.components?.include ?? [])])].filter((id) => id !== 'ruflo' && !excluded.has(id));
}

export async function projectPlan({ root, preset = 'developer', requestedConfig }) {
  const projectRoot = await findProjectRoot(root);
  const config = requestedConfig ?? await desiredConfig(projectRoot, preset);
  const detection = await detectProfiles(projectRoot);
  const [profiles, components] = [await resolveProfiles(detection, config), await resolveComponents(config)];
  const instructions = await profileInstructions(profiles);
  const actions = [
    action('planned', 'detect project profiles', profiles.join(', ')),
    action('planned', `manage ${join(projectRoot, 'AGENTS.md')}`, 'bounded Codex Kit marker block', { scope: 'project', reversibility: 'full' }),
    action('planned', `write ${configPath(projectRoot)}`, 'committed desired setup', { scope: 'project', reversibility: 'full' }),
    action('planned', `write ${statePath(projectRoot)}`, 'runtime receipt', { scope: 'project', reversibility: 'full' })
  ];
  actions.push(action(detection.graphifyRecommended ? 'planned' : 'skipped', 'recommend Graphify', detection.graphifyRecommended ? 'threshold met; install/build/hooks remain opt-in' : 'below recommendation threshold'));
  if (detection.frameworkConflict) actions.push(action('conflict', 'Spring and Quarkus detected', 'confirm the intended framework before applying.'));
  for (const component of components.filter((id) => ['promptx', 'clean-code'].includes(id))) actions.push(action('planned', `provision ${component}`, 'portable project skill', { reversibility: 'full' }));
  actions.push(action(config.tools?.graphify?.install ? 'planned' : 'skipped', 'provision Graphify setup', config.tools?.graphify?.install ? 'copies the explicit setup adapter; build and hooks remain separate' : 'enable tools.graphify.install in project config to provision'));
  return { status: detection.frameworkConflict ? 'conflict' : 'ok', project: await projectName(projectRoot), root: projectRoot, config, profiles, components, instructions, graphifyRecommended: detection.graphifyRecommended, actions };
}

export async function applyProject(plan) {
  if (plan.status === 'conflict') return plan;
  return withLock(plan.root, async () => {
    const transaction = await beginTransaction(plan.root, 'project');
    try {
      const agentsPath = join(plan.root, 'AGENTS.md');
      const original = exists(agentsPath) ? await readFile(agentsPath, 'utf8') : '';
      const block = renderManagedBlock({ profiles: plan.profiles, components: plan.components, instructions: plan.instructions });
      await writeTracked(transaction, agentsPath, mergeManagedBlock(original, block));
      await writeTracked(transaction, configPath(plan.root), `${JSON.stringify(plan.config, null, 2)}\n`);
      await writeTracked(transaction, statePath(plan.root), `${JSON.stringify({ schemaVersion: 2, profiles: plan.profiles, components: plan.components, updatedAt: new Date().toISOString() }, null, 2)}\n`);
      const portableTools = [
        ['promptx', join(kitRoot, 'promptx', 'skills', 'prompt-enhancer'), 'prompt-enhancer'],
        ['clean-code', join(kitRoot, 'continuous-clean-code-refactor'), 'continuous-clean-code-refactor']
      ];
      for (const [component, source, name] of portableTools) if (plan.components.includes(component)) {
        const destination = join(plan.root, '.agents', 'skills', name);
        if (!exists(destination)) {
          await mkdir(join(plan.root, '.agents', 'skills'), { recursive: true });
          await cp(source, destination, { recursive: true, dereference: false });
          transaction.files.push({ path: `.agents/skills/${name}`, beforeExists: false, backup: null, beforeHash: null, afterHash: await pathHash(destination) });
        }
      }
      if (plan.config.tools?.graphify?.install) {
        const destination = join(plan.root, '.codex-kit', 'tools', 'setup-graphify-codex.mjs');
        if (!exists(destination)) {
          await mkdir(join(plan.root, '.codex-kit', 'tools'), { recursive: true });
          await cp(join(kitRoot, 'setup-graphify-codex.mjs'), destination);
          transaction.files.push({ path: '.codex-kit/tools/setup-graphify-codex.mjs', beforeExists: false, backup: null, beforeHash: null, afterHash: await pathHash(destination) });
        }
      }
      const receipt = await finishTransaction(transaction);
      return { ...plan, status: 'ok', transactionId: receipt.id, actions: plan.actions.map((item) => item.state === 'planned' ? { ...item, state: 'changed' } : item) };
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
  if (remove) config.components.include = (config.components.include ?? []).filter((id) => id !== component);
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
  const checks = [['Node', process.execPath], ['Git', 'git'], ['Codex CLI', 'codex'], ['GitHub CLI', 'gh']];
  const actions = checks.map(([label, command]) => {
    const result = command === process.execPath ? { status: 0, stdout: process.version } : run(command, ['--version']);
    return action(result.status === 0 ? 'ready' : 'warning', label, (result.stdout || result.stderr || result.error || '').trim().split(/\r?\n/)[0]);
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
