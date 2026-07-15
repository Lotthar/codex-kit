import { homedir } from 'node:os';
import { join } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { action, exists, run } from './util.mjs';
import { loadManifest, presetComponents } from './manifest.mjs';
import { mergeManagedBlock, renderManagedBlock } from './managed.mjs';
import { beginTransaction, finishTransaction, withLock, writeTracked } from './transaction.mjs';
import { readText } from './platform.mjs';
import { readConfig, setTomlValues } from './config.mjs';

export const codexHome = () => process.env.CODEX_HOME || join(homedir(), '.codex');

export async function globalPlan({ preset = 'developer', home = codexHome(), allowNetwork = false }) {
  const manifest = await loadManifest();
  const components = await presetComponents(preset);
  const actions = [action('planned', `manage ${join(home, 'AGENTS.md')}`, 'bounded global policy block', { scope: 'global', reversibility: 'full' })];
  for (const id of components) {
    const component = manifest.components[id];
    if (!component.scope.includes('global') || component.kind === 'policy') continue;
    const detail = component.kind === 'plugin' ? `${component.plugin} (locked ${component.version})` : `${component.command} ${component.args.join(' ')}`;
    actions.push(action(allowNetwork ? 'planned' : 'skipped', `install ${id}`, allowNetwork ? detail : `${detail}; pass --allow-network to execute`, { scope: 'global', requiresNetwork: true, reversibility: 'best-effort' }));
  }
  return { status: 'ok', preset, home, components, actions };
}

export async function applyGlobal(plan, allowNetwork = false) {
  return withLock(plan.home, async () => {
    const transaction = await beginTransaction(plan.home, 'global');
    const manifest = await loadManifest();
    const introduced = [];
    try {
      if (allowNetwork) for (const id of plan.components) {
        const component = manifest.components[id];
        if (!component.scope.includes('global') || component.kind === 'policy') continue;
        const inspect = run('codex', component.kind === 'plugin' ? ['plugin', 'list'] : ['mcp', 'list']);
        const marker = component.kind === 'plugin' ? component.plugin.split('@')[0] : id;
        if (inspect.status === 0 && inspect.stdout.includes(marker)) {
          transaction.actions.push({ id, status: 0, unchanged: true, reversibility: 'best-effort' });
          continue;
        }
        const command = component.kind === 'plugin' ? ['plugin', 'add', component.plugin] : ['mcp', 'add', id, '--', component.command, ...component.args];
        const result = run('codex', command);
        transaction.actions.push({ id, command: ['codex', ...command], status: result.status, reversibility: 'best-effort' });
        if (result.status !== 0) throw new Error(`Unable to install ${id}: ${result.stderr || result.error || 'codex command failed'}`);
        introduced.push({ id, kind: component.kind, plugin: component.plugin });
      }
      const policyPath = join(plan.home, 'AGENTS.md');
      const original = await readText(policyPath);
      const policySource = await readText(join((await import('./manifest.mjs')).kitRoot, manifest.components['base-policy'].source));
      const policy = renderManagedBlock({ scope: 'global', components: plan.components.filter((id) => manifest.components[id].scope.includes('global')), profiles: [], instructions: [{ id: 'Portable policy', text: policySource }] });
      await writeTracked(transaction, policyPath, mergeManagedBlock(original, policy, 'global'));
      const receipt = await finishTransaction(transaction);
      return { ...plan, status: 'ok', transactionId: receipt.id, actions: plan.actions.map((item) => item.state === 'planned' ? { ...item, state: 'changed' } : item) };
    } catch (error) {
      for (const item of introduced.reverse()) {
        const command = item.kind === 'plugin' ? ['plugin', 'remove', item.plugin] : ['mcp', 'remove', item.id];
        const result = run('codex', command);
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
