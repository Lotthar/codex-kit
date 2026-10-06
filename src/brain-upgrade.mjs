import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBrainRegistry } from './brain-registry.mjs';
import { brainInit } from './obsidian.mjs';
import { brainReconcile } from './brain-reconcile.mjs';
import { globalPlan, applyGlobal } from './global.mjs';
import { projectPlan, applyProject } from './project.mjs';
import { finishProjectSetup } from './brain-workflow.mjs';
import { beginTransaction, finishTransaction, pathHash, withLock, writeTracked } from './transaction.mjs';
import { action, atomicWrite, exists, readJson } from './util.mjs';
import { kitRoot, loadManifest } from './manifest.mjs';

const digest = (text) => createHash('sha256').update(text).digest('hex');
const safeId = (value) => /^[a-f0-9-]{36}$/.test(value);
const runDirectory = (home, id) => join(home, '.codex-kit', 'upgrades', id);

async function fileHash(path) { return exists(path) ? pathHash(path) : null; }
async function fingerprint(root, scope) {
  const paths = scope === 'global'
    ? ['AGENTS.md', '.codex-kit/global-assets.json', 'skills/obsidian-project-brain']
    : ['AGENTS.md', '.codex-kit/config.json', '.codex-kit/state.json', '.agents/skills/obsidian-project-brain'];
  return digest(JSON.stringify(await Promise.all(paths.map(async (path) => [path, await fileHash(join(root, path))]))));
}
async function sourceHash() {
  return digest(JSON.stringify(await Promise.all(['src', 'policies', 'catalog', 'workflow-skills/obsidian-project-brain'].map((path) => pathHash(join(kitRoot, path))))));
}

async function selectedGlobal(home) {
  const text = exists(join(home, 'AGENTS.md')) ? await readFile(join(home, 'AGENTS.md'), 'utf8') : '';
  const block = text.match(/<!-- codex-kit:global:start -->([\s\S]*?)<!-- codex-kit:global:end -->/)?.[1] || '';
  const selected = [...block.matchAll(/^- Global component: `([^`]+)`\./gm)].map((match) => match[1]);
  const manifest = await loadManifest();
  for (const id of selected) if (!manifest.components[id]) throw new Error(`Unknown installed global component: ${id}`);
  return [...new Set([...(selected.length ? selected : ['base-policy']), 'obsidian-brain'])];
}

async function projectUpgradePlan(entry) {
  let plan = await projectPlan({ root: entry.root, preset: 'minimal' });
  if (plan.config.components?.exclude?.includes('obsidian-brain')) throw new Error('Brain is explicitly excluded by this repository; resolve the exclusion before upgrading.');
  const existing = plan.config.tools?.obsidian?.projectKey;
  if (existing && existing !== entry.key) throw new Error('Registered and configured Brain keys disagree.');
  const config = structuredClone(plan.config);
  config.components.include = [...new Set([...(config.components.include ?? []), 'obsidian-brain'])];
  config.tools ??= {};
  config.tools.obsidian = { ...config.tools.obsidian, projectKey: entry.key };
  return projectPlan({ root: entry.root, requestedConfig: config });
}

export async function brainUpgradePlan({ home }) {
  const registry = await loadBrainRegistry({ home });
  const targets = [{ id: 'global', scope: 'global', root: home, fingerprint: await fingerprint(home, 'global') }];
  for (const entry of registry.projects.filter((item) => item.inclusion === 'included')) {
    const target = { id: entry.key, scope: entry.kind === 'git' ? 'project' : 'brain', root: entry.root, project: entry };
    try {
      if (entry.root && !exists(entry.root)) throw new Error('Registered directory is unavailable.');
      if (target.scope === 'project') {
        await projectUpgradePlan(entry);
        target.fingerprint = await fingerprint(entry.root, 'project');
      }
    } catch (error) { target.error = error.message; }
    targets.push(target);
  }
  const source = await sourceHash();
  const manifestHash = digest(JSON.stringify({ source, targets }));
  return { status: targets.some((target) => target.error) ? 'partial' : 'ok', sourceHash: source, manifestHash, targets, actions: [...targets.map((target) => action(target.error ? 'conflict' : 'planned', `upgrade ${target.id}`, target.error || target.scope)), ...registry.projects.filter((entry) => entry.inclusion !== 'included').map((entry) => action('skipped', `upgrade ${entry.key}`, entry.inclusion))] };
}

async function createRun(home, plan) {
  return withLock(home, async () => {
    const parent = join(home, '.codex-kit', 'upgrades');
    if (exists(parent)) for (const id of await readdir(parent)) {
      if (!safeId(id)) continue;
      const previous = await readJson(join(parent, id, 'run.json'), null);
      if (previous && previous.status !== 'ok') throw new Error(`An incomplete upgrade exists; resume it with --resume ${id}.`);
    }
    const id = randomUUID();
    const state = { schemaVersion: 1, id, status: 'running', sourceHash: plan.sourceHash, manifestHash: plan.manifestHash, targets: plan.targets.map((target) => ({ ...target, state: 'pending' })) };
    const transaction = await beginTransaction(home, 'global');
    await writeTracked(transaction, join(runDirectory(home, id), 'run.json'), `${JSON.stringify(state, null, 2)}\n`);
    await finishTransaction(transaction);
    return state;
  });
}

function receipt(state) {
  return { status: state.status, upgradeId: state.id, manifestHash: state.manifestHash, targets: state.targets.map(({ id, scope, state, error, transactionId }) => ({ id, scope, state, ...(error ? { error } : {}), ...(transactionId ? { transactionId } : {}) })), actions: state.targets.map((target) => action(target.state === 'complete' ? 'unchanged' : 'failed', `upgrade ${target.id}`, target.error || target.state)) };
}

export async function upgradeAll({ home, execute = false, resume, expectedHash, runner, operations = {} }) {
  if (resume && !safeId(resume)) throw new Error('Invalid upgrade run ID.');
  const plan = await brainUpgradePlan({ home });
  if (!execute) return { ...plan, ...(resume ? { resume } : {}) };
  if ((!resume && !expectedHash) || (expectedHash && expectedHash !== plan.manifestHash)) throw new Error('Review the current upgrade manifest and provide its --expected-hash before applying.');
  if (!resume && plan.status !== 'ok') return plan;
  let state = resume ? await readJson(join(runDirectory(home, resume), 'run.json')) : await createRun(home, plan);
  if (state.schemaVersion !== 1 || state.id !== (resume || state.id) || !Array.isArray(state.targets)) throw new Error('Invalid upgrade state.');
  const identities = (targets) => targets.map(({ id, scope, root, project }) => ({ id, scope, root, project })).sort((a, b) => a.id.localeCompare(b.id));
  if (JSON.stringify(identities(state.targets)) !== JSON.stringify(identities(plan.targets)) || state.targets.some((target) => !['global', 'project', 'brain'].includes(target.scope) || !['pending', 'applying', 'partial', 'complete'].includes(target.state))) throw new Error('Registered upgrade targets changed or the recovery ledger is invalid; inspect the run before applying.');
  if (state.sourceHash !== plan.sourceHash) throw new Error('Kit source changed during an upgrade; inspect and reconcile the existing run before resuming.');
  const directory = runDirectory(home, state.id);
  return withLock(directory, async () => {
    const save = () => atomicWrite(join(directory, 'run.json'), `${JSON.stringify(state, null, 2)}\n`);
    for (const target of state.targets) {
      if (target.state === 'complete') continue;
      try {
        let result;
        if (target.scope !== 'brain') {
          const current = await fingerprint(target.root, target.scope);
          if (target.state === 'applying' && current !== target.fingerprint && current !== target.lastFingerprint) {
            if (expectedHash !== plan.manifestHash) throw new Error('Interrupted target changed; preview again and provide its --expected-hash before retrying.');
            target.fingerprint = current;
            target.lastFingerprint = current;
          } else if (target.state === 'partial' && target.lastFingerprint && current !== target.lastFingerprint && expectedHash !== plan.manifestHash) throw new Error('Partial target changed; preview again and provide its --expected-hash when resuming.');
        }
        if (target.scope === 'global') {
          const current = await fingerprint(home, 'global');
          if (target.state === 'pending' && current !== target.fingerprint) throw new Error('Global inputs changed since preview.');
          target.state = 'applying'; await save();
          result = await (operations.applyGlobal || applyGlobal)(await globalPlan({ home, components: await selectedGlobal(home), allowNetwork: false }), false);
        } else if (target.scope === 'project') {
          if (target.state === 'pending' && await fingerprint(target.root, 'project') !== target.fingerprint) throw new Error('Project inputs changed since preview.');
          target.state = 'applying'; await save();
          result = await (operations.applyProject || applyProject)(await projectUpgradePlan(target.project), { assetComponents: ['obsidian-brain'] });
          if (result.status === 'ok' && !operations.applyProject) result = await finishProjectSetup({ home, result, execute: true, runner, reconcile: false });
        } else {
          result = await (operations.brainInit || brainInit)({ home, projectKey: target.id, execute: true, runner });
        }
        target.transactionId = result.transactionId;
        if (result.status !== 'ok') throw new Error((result.actions || []).filter((item) => ['failed', 'conflict', 'recommended'].includes(item.state)).map((item) => `${item.label}: ${item.detail}`).join('; ') || 'Target was only partially upgraded.');
        target.state = 'complete'; delete target.error;
      } catch (error) { target.state = 'partial'; target.error = error.message; }
      if (target.scope !== 'brain') target.lastFingerprint = await fingerprint(target.root, target.scope);
      await save();
    }
    if (state.targets.every((target) => target.state === 'complete')) {
      const projects = (await loadBrainRegistry({ home })).projects;
      const index = await (operations.brainReconcile || brainReconcile)({ home, projects, scope: 'all', execute: true, runner });
      state.indexed = index.status === 'ok';
      state.indexActions = index.actions;
    }
    state.status = state.targets.every((target) => target.state === 'complete') && state.indexed ? 'ok' : 'partial';
    await save();
    return { ...receipt(state), indexed: state.indexed || false, actions: [...receipt(state).actions, ...(state.indexActions || [])] };
  });
}
