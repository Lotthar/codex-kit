import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { action, atomicWrite, backup, exists, run } from './util.mjs';
import { loadManifest, presetComponents } from './manifest.mjs';
import { readConfig, setTomlValues } from './config.mjs';

export const codexHome = () => process.env.CODEX_HOME || join(homedir(), '.codex');

export async function globalPlan({ preset, home = codexHome(), allowNetwork = false }) {
  const manifest = await loadManifest();
  const components = await presetComponents(preset);
  const actions = [action('planned', `create/update ${join(home, 'AGENTS.md')}`, 'managed global policy block')];
  for (const id of components) {
    const component = manifest.components[id];
    if (!component.scope.includes('global') || component.kind === 'policy') continue;
    const detail = component.kind === 'plugin' ? component.plugin : `${component.command} ${component.args.join(' ')}`;
    actions.push(action(allowNetwork ? 'planned' : 'skipped', `install ${id}`, allowNetwork ? detail : `${detail}; pass --allow-network to execute`));
  }
  return { preset, home, components, actions };
}

export async function applyGlobal({ preset, home = codexHome(), allowNetwork = false, execute = false }) {
  const plan = await globalPlan({ preset, home, allowNetwork });
  if (!execute) return plan;
  await mkdir(home, { recursive: true });
  const policyPath = join(home, 'AGENTS.md');
  const original = exists(policyPath) ? await readFile(policyPath, 'utf8') : '';
  const marker = '<!-- codex-kit:global-policy -->';
  const policy = `${marker}\n# Codex Kit Global Policy\n\nUse focused context, least-complex verified changes, and Ruflo only for persistent coordination across three or more dependent workstreams.\n`;
  const updated = original.includes(marker) ? original.replace(new RegExp(`${marker}[\\s\\S]*$`), policy) : `${original.trimEnd()}${original.trim() ? '\n\n' : ''}${policy}`;
  if (updated !== original) { await backup(policyPath, home); await atomicWrite(policyPath, updated); }
  const results = [];
  if (allowNetwork) {
    const manifest = await loadManifest();
    for (const id of plan.components) {
      const component = manifest.components[id];
      if (!component.scope.includes('global')) continue;
      if (component.kind === 'plugin') results.push(run('codex', ['plugin', 'add', component.plugin]));
      if (component.kind === 'mcp') results.push(run('codex', ['mcp', 'add', id, '--', component.command, ...component.args]));
    }
  }
  return { ...plan, applied: true, commandResults: results };
}

export async function safeExport(source, output) {
  const excluded = new Set(['auth.json', 'config.toml', 'history.jsonl', 'sessions', 'cache', 'state', 'oauth']);
  const result = { schemaVersion: 1, source: source.replace(homedir(), '~'), exportedAt: new Date().toISOString(), artifacts: [] };
  for (const name of ['AGENTS.md', 'skills']) {
    if (excluded.has(name) || !exists(join(source, name))) continue;
    if (name === 'AGENTS.md') result.artifacts.push({ type: 'policy', path: name });
    else {
      const entries = await readdir(join(source, 'skills'), { withFileTypes: true });
      result.artifacts.push({ type: 'skills', names: entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort() });
    }
  }
  if (output) await atomicWrite(output, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export async function setAllowlistedConfig(configPath, section, values, root) {
  const original = await readConfig(configPath);
  const updated = setTomlValues(original, section, values);
  if (original === updated) return { changed: false };
  await backup(configPath, root);
  await atomicWrite(configPath, updated);
  return { changed: true };
}
