import { homedir } from 'node:os';
import { isAbsolute, join, win32 } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { action, exists, readJson, run } from './util.mjs';
import { loadLock, loadManifest, presetComponents } from './manifest.mjs';
import { mergeManagedBlock, renderManagedBlock } from './managed.mjs';
import { beginTransaction, copyTracked, finishTransaction, pathHash, removeTracked, replaceTracked, withLock, writeTracked } from './transaction.mjs';
import { readText } from './platform.mjs';
import { readConfig, setTomlValues } from './config.mjs';
import { modelRoutingStatePath, parseModelCatalog, resolveModelRouting, routingActions, routingSummary } from './model-routing.mjs';

export const codexHome = () => process.env.CODEX_HOME || join(homedir(), '.codex');
const globalAssetsStatePath = (home) => join(home, '.codex-kit', 'global-assets.json');

function modelCatalog() {
  const result = run('codex', ['debug', 'models']);
  return result.status === 0 ? parseModelCatalog(result.stdout) : null;
}

function safeRoutingAsset(asset) {
  if (!asset || typeof asset.target !== 'string' || !asset.target || isAbsolute(asset.target) || win32.isAbsolute(asset.target) || asset.target.split(/[\\/]/).includes('..')) throw new Error('Invalid model-routing state target.');
  return asset;
}

function safeGlobalAsset(asset) {
  if (!asset || typeof asset.component !== 'string' || typeof asset.source !== 'string' || typeof asset.target !== 'string' || !asset.target || isAbsolute(asset.target) || win32.isAbsolute(asset.target) || asset.target.split(/[\\/]/).includes('..')) throw new Error('Invalid global asset.');
  return asset;
}

function globalAssetsFor(components, manifest) {
  return components.flatMap((component) => (manifest.components[component]?.globalAssets ?? []).map((asset) => safeGlobalAsset({ component, ...asset })));
}

function pluginCatalog(stdout) {
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { throw new Error('codex plugin list did not return JSON.'); }
  if (!Array.isArray(parsed?.installed)) throw new Error('codex plugin list returned an unexpected catalog.');
  return parsed.installed;
}

function compareVersions(left, right) {
  const parse = (version) => version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+.+)?$/)?.slice(1);
  const leftParts = parse(left);
  const rightParts = parse(right);
  if (!leftParts || !rightParts) return null;
  for (let index = 0; index < 3; index += 1) {
    const difference = Number(leftParts[index]) - Number(rightParts[index]);
    if (difference) return Math.sign(difference);
  }
  if (leftParts[3] === rightParts[3]) return 0;
  if (leftParts[3] === undefined) return 1;
  if (rightParts[3] === undefined) return -1;
  return leftParts[3].localeCompare(rightParts[3]);
}

function pluginFailure(id, result) {
  return new Error(`Unable to install ${id}: ${result?.stderr || result?.error || 'codex command failed'}`);
}

function installedPlugin(result, plugin) {
  if (result?.status !== 0) throw pluginFailure(plugin, result);
  return pluginCatalog(result.stdout).find((entry) => entry?.pluginId === plugin);
}

export async function globalPlan({ preset = 'developer', home = codexHome(), allowNetwork = false, modelRouting = false, memories = false, obsidian = false, components: selectedComponents, catalog = undefined }) {
  const manifest = await loadManifest();
  if (selectedComponents !== undefined && (!Array.isArray(selectedComponents) || selectedComponents.some((id) => typeof id !== 'string' || !manifest.components[id]))) throw new Error('Global components must be known component IDs.');
  const components = [...new Set(selectedComponents ?? [...await presetComponents(preset), ...(modelRouting ? ['model-routing'] : []), ...(obsidian ? ['obsidian-brain'] : [])])]
    .filter((id) => manifest.components[id].scope.includes('global'));
  const actions = [action('planned', `manage ${join(home, 'AGENTS.md')}`, 'bounded global policy block', { scope: 'global', reversibility: 'full' })];
  const globalAssets = globalAssetsFor(components, manifest);
  for (const asset of globalAssets) actions.push(action('planned', `provision ${asset.target}`, asset.component, { kind: 'global-asset', scope: 'global', reversibility: 'full' }));
  for (const id of components) {
    const component = manifest.components[id];
    if (!component.scope.includes('global') || !['plugin', 'mcp'].includes(component.kind)) continue;
    const detail = component.kind === 'plugin' ? `${component.plugin} (locked ${component.version})` : `${component.command} ${component.args.join(' ')}`;
    actions.push(action(allowNetwork ? 'planned' : 'skipped', `install ${id}`, allowNetwork ? detail : `${detail}; pass --allow-network to execute`, { scope: 'global', requiresNetwork: true, reversibility: 'best-effort' }));
  }
  const routing = modelRouting ? resolveModelRouting(catalog === undefined ? modelCatalog() : catalog) : null;
  if (routing) actions.push(...routingActions(routing));
  if (memories) actions.push(action('planned', 'enable native Codex memories', 'experimental companion; Obsidian remains the curated project brain', { scope: 'global', reversibility: 'full' }));
  const plan = { status: 'ok', preset, home, components, memories, ...(routing ? { models: routingSummary(routing) } : {}), actions };
  Object.defineProperty(plan, 'globalAssets', { value: globalAssets });
  if (routing) Object.defineProperty(plan, 'routing', { value: routing });
  return plan;
}

async function applyGlobalAssets(transaction, home, desiredAssets) {
  const statePath = globalAssetsStatePath(home);
  const previous = await readJson(statePath, { assets: [] });
  if (!Array.isArray(previous.assets ?? [])) throw new Error('Invalid global assets state.');
  const previousAssets = new Map((previous.assets ?? []).map(safeGlobalAsset).map((asset) => [asset.target, asset]));
  const installedAssets = [];
  const actions = [];
  for (const asset of desiredAssets.map(safeGlobalAsset)) {
    const source = join((await import('./manifest.mjs')).kitRoot, asset.source);
    const destination = join(home, asset.target);
    const sourceHash = await pathHash(source);
    if (!exists(destination)) {
      await copyTracked(transaction, source, destination);
      installedAssets.push({ component: asset.component, source: asset.source, target: asset.target, hash: sourceHash });
      actions.push(action('changed', `provision ${asset.target}`, asset.component));
      continue;
    }
    const currentHash = await pathHash(destination);
    const owned = previousAssets.get(asset.target);
    if (owned?.hash !== currentHash) {
      actions.push(action(currentHash === sourceHash ? 'unchanged' : 'conflict', `provision ${asset.target}`, currentHash === sourceHash ? 'matching existing content preserved as user-owned' : 'existing user content preserved'));
      continue;
    }
    if (currentHash !== sourceHash) {
      await replaceTracked(transaction, source, destination);
      actions.push(action('changed', `update ${asset.target}`, asset.component));
    } else actions.push(action('unchanged', `provision ${asset.target}`, 'already matches Codex Kit'));
    installedAssets.push({ component: asset.component, source: asset.source, target: asset.target, hash: sourceHash });
  }
  const desiredTargets = new Set(desiredAssets.map((asset) => asset.target));
  for (const previousAsset of previousAssets.values()) if (!desiredTargets.has(previousAsset.target)) {
    const destination = join(home, previousAsset.target);
    if (!exists(destination)) continue;
    if (await pathHash(destination) !== previousAsset.hash) actions.push(action('conflict', `remove ${previousAsset.target}`, 'modified content preserved'));
    else {
      await removeTracked(transaction, destination);
      actions.push(action('changed', `remove ${previousAsset.target}`, 'component no longer selected'));
    }
  }
  await writeTracked(transaction, statePath, `${JSON.stringify({ schemaVersion: 1, assets: installedAssets }, null, 2)}\n`);
  return actions;
}

async function applyModelRouting(transaction, home, routing) {
  const statePath = modelRoutingStatePath(home);
  const previous = await readJson(statePath, { assets: [] });
  if (!Array.isArray(previous.assets ?? [])) throw new Error('Invalid model-routing state assets.');
  const previousAssets = (previous.assets ?? []).map(safeRoutingAsset);
  const owned = new Map(previousAssets.map((asset) => [asset.target, asset]));
  const actions = [];
  const assets = [];
  for (const asset of routing.assets.map(safeRoutingAsset)) {
    const path = join(home, asset.target);
    if (!exists(path)) {
      await writeTracked(transaction, path, asset.content);
      actions.push(action('changed', `provision model role ${asset.id}`, asset.model ?? 'inherit current Codex model'));
      assets.push({ target: asset.target, hash: asset.hash });
      continue;
    }
    const currentHash = await pathHash(path);
    if (owned.get(asset.target)?.hash !== currentHash) {
      actions.push(action('conflict', `provision model role ${asset.id}`, 'existing user-managed file preserved'));
      continue;
    }
    if (currentHash !== asset.hash) {
      await writeTracked(transaction, path, asset.content);
      actions.push(action('changed', `refresh model role ${asset.id}`, asset.model ?? 'inherit current Codex model'));
    } else actions.push(action('unchanged', `provision model role ${asset.id}`, 'already matches Codex Kit'));
    assets.push({ target: asset.target, hash: asset.hash });
  }
  for (const asset of previousAssets) if (!routing.assets.some((item) => item.target === asset.target)) {
    const path = join(home, asset.target);
    if (!exists(path)) continue;
    if (await pathHash(path) !== asset.hash) actions.push(action('conflict', `remove model role ${asset.target}`, 'modified file preserved'));
    else { await removeTracked(transaction, path); actions.push(action('changed', `remove model role ${asset.target}`, 'no longer managed')); }
  }
  const stateContent = `${JSON.stringify({ schemaVersion: 1, assets }, null, 2)}\n`;
  if (!exists(statePath) || await readText(statePath) !== stateContent) await writeTracked(transaction, statePath, stateContent);
  return actions;
}

export async function modelRoutingPlan({ home = codexHome(), catalog = undefined } = {}) {
  const routing = resolveModelRouting(catalog === undefined ? modelCatalog() : catalog);
  const plan = { status: 'ok', home, models: routingSummary(routing), actions: routingActions(routing) };
  Object.defineProperty(plan, 'routing', { value: routing });
  return plan;
}

export async function modelRoutingStatus({ home = codexHome(), catalog = undefined } = {}) {
  const plan = await modelRoutingPlan({ home, catalog });
  const state = await readJson(modelRoutingStatePath(home), { assets: [] });
  if (!Array.isArray(state.assets ?? [])) throw new Error('Invalid model-routing state assets.');
  const owned = new Map((state.assets ?? []).map(safeRoutingAsset).map((asset) => [asset.target, asset]));
  const actions = [];
  for (const asset of plan.routing.assets.map(safeRoutingAsset)) {
    const path = join(home, asset.target);
    if (!exists(path)) {
      actions.push(action('warning', `model role ${asset.id}`, 'not installed'));
      continue;
    }
    const state = owned.get(asset.target);
    const currentHash = await pathHash(path);
    if (state?.hash === currentHash) actions.push(action('unchanged', `model role ${asset.id}`, asset.model ? `${asset.model}${asset.effort ? ` (${asset.effort})` : ''}` : 'inherits current Codex model'));
    else actions.push(action('warning', `model role ${asset.id}`, 'user-managed or modified'));
  }
  return { status: actions.some((item) => item.state === 'warning') ? 'partial' : 'ok', home, models: plan.models, actions };
}

export async function applyModelRoutingPlan(plan) {
  return withLock(plan.home, async () => {
    const transaction = await beginTransaction(plan.home, 'global');
    try {
      const actions = await applyModelRouting(transaction, plan.home, plan.routing);
      const receipt = await finishTransaction(transaction);
      return { ...plan, status: actions.some((item) => item.state === 'conflict') ? 'partial' : 'ok', transactionId: receipt.id, actions };
    } catch (error) {
      const receipt = await finishTransaction(transaction, 'failed');
      const { rollbackTransaction } = await import('./transaction.mjs');
      await rollbackTransaction(plan.home, receipt.id);
      throw error;
    }
  });
}

export async function applyGlobal(plan, allowNetwork = false, runner = run) {
  return withLock(plan.home, async () => {
    const transaction = await beginTransaction(plan.home, 'global');
    const manifest = await loadManifest();
    const runCodex = (args) => runner('codex', args, { env: { ...process.env, CODEX_HOME: plan.home } });
    const introduced = [];
    const integrationActions = [];
    try {
      if (allowNetwork) for (const id of plan.components) {
        const component = manifest.components[id];
        if (!component.scope.includes('global') || !['plugin', 'mcp'].includes(component.kind)) continue;
        if (component.kind === 'plugin') {
          const { components } = await loadLock();
          const locked = components[id];
          if (!component.marketplace || !locked?.gitCommit) throw new Error(`Plugin ${id} is missing locked marketplace metadata.`);
          const current = installedPlugin(runCodex(['plugin', 'list', '--json']), component.plugin);
          if (current?.enabled === false) {
            integrationActions.push(action('conflict', `install ${id}`, `installed ${current.version} is disabled; preserved`));
            continue;
          }
          if (current?.version === component.version) {
            transaction.actions.push({ id, status: 0, unchanged: true, reversibility: 'best-effort' });
            integrationActions.push(action('unchanged', `install ${id}`, `already matches locked ${component.version}`));
            continue;
          }
          const versionComparison = current && compareVersions(current.version, component.version);
          if (current && versionComparison === null) {
            integrationActions.push(action('conflict', `install ${id}`, `installed ${current.version} has an unrecognized version; preserved`));
            continue;
          }
          if (current && versionComparison > 0) {
            integrationActions.push(action('conflict', `install ${id}`, `installed ${current.version} is newer than locked ${component.version}; preserved`));
            continue;
          }
          const marketplace = runCodex(['plugin', 'marketplace', 'add', component.marketplace, '--ref', locked.gitCommit]);
          transaction.actions.push({ id, command: ['codex', 'plugin', 'marketplace', 'add', component.marketplace, '--ref', locked.gitCommit], status: marketplace.status, reversibility: 'best-effort' });
          if (marketplace.status !== 0) throw pluginFailure(id, marketplace);
          const installed = runCodex(['plugin', 'add', component.plugin, '--json']);
          transaction.actions.push({ id, command: ['codex', 'plugin', 'add', component.plugin, '--json'], status: installed.status, reversibility: 'best-effort' });
          if (installed.status !== 0) throw pluginFailure(id, installed);
          if (!current) introduced.push({ id, kind: component.kind, plugin: component.plugin });
          const verified = installedPlugin(runCodex(['plugin', 'list', '--json']), component.plugin);
          if (verified?.version !== component.version) throw new Error(`Codex rejected the installed ${id} version.`);
          integrationActions.push(action('changed', `install ${id}`, `locked ${component.version}`));
          continue;
        }
        const inspect = runCodex(['mcp', 'list']);
        const marker = id;
        if (inspect.status === 0 && inspect.stdout.includes(marker)) {
          transaction.actions.push({ id, status: 0, unchanged: true, reversibility: 'best-effort' });
          continue;
        }
        const command = ['mcp', 'add', id, '--', component.command, ...component.args];
        const result = runCodex(command);
        transaction.actions.push({ id, command: ['codex', ...command], status: result.status, reversibility: 'best-effort' });
        if (result.status !== 0) throw new Error(`Unable to install ${id}: ${result.stderr || result.error || 'codex command failed'}`);
        introduced.push({ id, kind: component.kind, plugin: component.plugin });
      }
      const policyPath = join(plan.home, 'AGENTS.md');
      const original = await readText(policyPath);
      const instructions = await Promise.all(plan.components.filter((id) => manifest.components[id].scope.includes('global') && manifest.components[id].kind === 'policy').map(async (id) => ({ id, text: await readText(join((await import('./manifest.mjs')).kitRoot, manifest.components[id].source)) })));
      const policy = renderManagedBlock({ scope: 'global', components: plan.components.filter((id) => manifest.components[id].scope.includes('global')), profiles: [], instructions });
      await writeTracked(transaction, policyPath, mergeManagedBlock(original, policy, 'global'));
      const assetActions = await applyGlobalAssets(transaction, plan.home, plan.globalAssets ?? globalAssetsFor(plan.components, manifest));
      if (plan.memories) {
        const configPath = join(plan.home, 'config.toml');
        await writeTracked(transaction, configPath, setTomlValues(await readConfig(configPath), 'features', { memories: 'true' }));
      }
      const routingActions = plan.routing ? await applyModelRouting(transaction, plan.home, plan.routing) : [];
      const receipt = await finishTransaction(transaction);
      const baseActions = plan.actions.filter((item) => item.kind !== 'global-asset' && !integrationActions.some((action) => action.label === item.label)).map((item) => item.state === 'planned' ? { ...item, state: 'changed' } : item);
      const partial = [...integrationActions, ...assetActions, ...routingActions].some((item) => item.state === 'conflict');
      return { ...plan, status: partial ? 'partial' : 'ok', transactionId: receipt.id, actions: [...baseActions, ...integrationActions, ...assetActions, ...routingActions] };
    } catch (error) {
      for (const item of introduced.reverse()) {
        const command = item.kind === 'plugin' ? ['plugin', 'remove', item.plugin] : ['mcp', 'remove', item.id];
        const result = runCodex(command);
        transaction.actions.push({ id: item.id, rollback: true, command: ['codex', ...command], status: result.status, reversibility: 'best-effort' });
      }
      const receipt = await finishTransaction(transaction, 'failed');
      const { rollbackTransaction } = await import('./transaction.mjs');
      await rollbackTransaction(plan.home, receipt.id);
      throw error;
    }
  });
}

const secretLike = /(?:api[_-]?key|secret|password|token)\s*[=:]/i;

export async function safeExport(source, output, includeContent = false) {
  const result = { schemaVersion: 2, source: '<redacted>', exportedAt: new Date().toISOString(), artifacts: [] };
  if (exists(join(source, 'AGENTS.md'))) {
    const content = await readFile(join(source, 'AGENTS.md'), 'utf8');
    result.artifacts.push({ type: 'policy', path: 'AGENTS.md', ...(includeContent && !secretLike.test(content) ? { content } : {}) });
  }
  if (exists(join(source, 'skills'))) {
    const names = (await readdir(join(source, 'skills'), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    const skills = [];
    if (includeContent) for (const name of names) {
      const path = join(source, 'skills', name, 'SKILL.md');
      if (!exists(path)) continue;
      const content = await readFile(path, 'utf8');
      if (content.length <= 1024 * 1024 && !secretLike.test(content)) skills.push({ name, path: `skills/${name}/SKILL.md`, content, sha256: createHash('sha256').update(content).digest('hex') });
    }
    result.artifacts.push({ type: 'skills', names, ...(includeContent ? { skills } : {}) });
  }
  if (output) result.output = output;
  return result;
}

export async function setAllowlistedConfig({ home = codexHome(), section, key, value }) {
  if (!key) throw new Error('Config key is required.');
  return withLock(home, async () => {
    const transaction = await beginTransaction(home, 'global');
    try {
      const path = join(home, 'config.toml');
      const updated = setTomlValues(await readConfig(path), section, { [key]: value });
      await writeTracked(transaction, path, updated);
      const receipt = await finishTransaction(transaction);
      return { status: 'ok', transactionId: receipt.id, actions: [action('changed', 'set allowlisted Codex config', `${section}.${key}`)] };
    } catch (error) {
      const receipt = await finishTransaction(transaction, 'failed');
      const { rollbackTransaction } = await import('./transaction.mjs');
      await rollbackTransaction(home, receipt.id);
      throw error;
    }
  });
}

export async function checkUpdates(allowNetwork) {
  if (!allowNetwork) return { status: 'ok', actions: [action('skipped', 'check component updates', 'pass --allow-network to query registries', { requiresNetwork: true })] };
  const result = run('npm', ['view', 'ruflo', 'version']);
  return { status: result.status === 0 ? 'ok' : 'partial', available: result.stdout.trim(), actions: [action(result.status === 0 ? 'unchanged' : 'failed', 'check Ruflo version', result.stderr.trim() || result.stdout.trim())] };
}
