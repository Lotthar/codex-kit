import { join, resolve } from 'node:path';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { action, atomicWrite, exists, readJson, run } from './util.mjs';
import { applyManagedBlock, renderManagedBlock } from './managed.mjs';
import { detectProfiles, projectName } from './profiles.mjs';
import { loadManifest, presetComponents } from './manifest.mjs';

const statePath = (root) => join(root, '.codex-kit', 'state.json');

export async function findProjectRoot(start = process.cwd()) {
  let root = resolve(start);
  while (root !== '/') { if (exists(join(root, '.git')) || exists(join(root, 'package.json')) || exists(join(root, 'pubspec.yaml')) || exists(join(root, 'pom.xml'))) return root; root = resolve(root, '..'); }
  return resolve(start);
}

export async function initProject({ root, preset = 'developer', requestedComponents, execute = false, enrich = false }) {
  const projectRoot = await findProjectRoot(root);
  const detection = await detectProfiles(projectRoot);
  const components = (requestedComponents?.length ? requestedComponents : await presetComponents(preset)).filter((id) => id !== 'ruflo');
  const projectComponents = components.filter((id) => ['base-policy', 'ponytail', 'graphify', 'promptx', 'clean-code'].includes(id));
  const actions = [
    action('planned', 'detect project profiles', detection.profiles.join(', ')),
    action('planned', `manage ${join(projectRoot, 'AGENTS.md')}`, 'bounded Codex Kit marker block'),
    action('planned', `write ${statePath(projectRoot)}`, 'setup receipt')
  ];
  actions.push(action(detection.graphifyRecommended ? 'planned' : 'skipped', 'recommend Graphify', detection.graphifyRecommended ? 'large project threshold met; install/build/hooks remain opt-in' : 'below recommendation threshold'));
  if (enrich) actions.push(action('planned', 'run safe Codex enrichment', 'proposal only; no automatic application'));
  const plan = { project: await projectName(projectRoot), root: projectRoot, profiles: detection.profiles, components: projectComponents, graphifyRecommended: detection.graphifyRecommended, actions };
  if (!execute) return plan;
  const block = renderManagedBlock({ profiles: detection.profiles, components: projectComponents });
  const receipt = await applyManagedBlock(join(projectRoot, 'AGENTS.md'), projectRoot, block);
  await mkdir(join(projectRoot, '.codex-kit'), { recursive: true });
  await atomicWrite(statePath(projectRoot), `${JSON.stringify({ schemaVersion: 1, preset, profiles: detection.profiles, components: projectComponents, graphifyRecommended: detection.graphifyRecommended, updatedAt: new Date().toISOString(), receipts: [receipt].filter(Boolean) }, null, 2)}\n`);
  return { ...plan, applied: true };
}

export async function modifyProject({ root, component, remove = false, execute = false }) {
  const projectRoot = await findProjectRoot(root);
  const manifest = await loadManifest();
  if (!manifest.components[component]) throw new Error(`Unknown component: ${component}. Add it to catalog/codex-kit.json first.`);
  const oldState = await readJson(statePath(projectRoot), { components: [] });
  const components = remove ? oldState.components.filter((id) => id !== component) : [...new Set([...oldState.components, component])];
  return initProject({ root: projectRoot, requestedComponents: components, preset: oldState.preset ?? 'developer', execute });
}

export async function rollbackProject(root) {
  const backupRoot = join(root, '.codex-kit', 'backups');
  if (!exists(backupRoot)) throw new Error('No Codex Kit backup exists for this project.');
  const candidates = (await readdir(backupRoot)).sort().reverse();
  const agentsBackup = candidates.find((name) => name.endsWith('AGENTS.md'));
  if (!agentsBackup) throw new Error('No AGENTS.md backup exists for this project.');
  await atomicWrite(join(root, 'AGENTS.md'), await readFile(join(backupRoot, agentsBackup), 'utf8'));
  return { actions: [action('applied', 'restore AGENTS.md', agentsBackup)] };
}

export function doctor() {
  const node = process.version;
  const codex = run('codex', ['--version']);
  const report = { node, codex: { available: codex.status === 0, version: codex.stdout.trim() || codex.stderr.trim() }, actions: [] };
  report.actions.push(action(codex.status === 0 ? 'applied' : 'conflict', 'Codex CLI', report.codex.version));
  return report;
}
