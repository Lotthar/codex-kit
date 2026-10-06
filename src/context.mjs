import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, join, win32 } from 'node:path';
import { markers } from './managed.mjs';
import { kitRoot, loadManifest } from './manifest.mjs';
import { action, exists, readJson } from './util.mjs';
import { BRAIN_RECALL_BUDGET_BYTES } from './obsidian.mjs';
import { pathHash } from './transaction.mjs';

function bytes(text) { return Buffer.byteLength(text, 'utf8'); }

async function readOptional(path) {
  try { return { exists: true, text: await readFile(path, 'utf8') }; }
  catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) return { exists: false, text: '' };
    return { exists: false, text: '', error: error.code || error.message };
  }
}

function managedBytes(text, scope) {
  const { start, end } = markers(scope);
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  if (from < 0 || to < 0) return 0;
  return bytes(text.slice(from, to + end.length));
}

async function agentFile(path, scope) {
  const result = await readOptional(path);
  const totalBytes = bytes(result.text);
  const kitManagedBytes = managedBytes(result.text, scope);
  const details = {
    path,
    exists: result.exists,
    totalBytes,
    kitManagedBytes,
    humanBytes: totalBytes - kitManagedBytes,
    ...(result.error ? { error: result.error } : {})
  };
  Object.defineProperty(details, 'text', { value: result.text });
  return details;
}

function safeTarget(target) {
  return typeof target === 'string'
    && target.length > 0
    && !isAbsolute(target)
    && !win32.isAbsolute(target)
    && !target.split(/[\\/]/).includes('..');
}

function declaredSkillAssets(manifest, scope) {
  return Object.entries(manifest.components).flatMap(([component, definition]) => {
    const assets = scope === 'global' ? definition.globalAssets : definition.assets;
    return (assets ?? []).filter((asset) => safeTarget(asset.target) && /(?:^|[\\/])skills[\\/][^\\/]+$/.test(asset.target)).map((asset) => ({ component, ...asset }));
  });
}

function skillName(text) {
  const match = text.match(/^name:\s*["']?([^\r\n"']+)["']?\s*$/m);
  return match?.[1].trim() || null;
}

async function declaredSkills(base, statePath, assets, scope) {
  let state;
  try { state = await readJson(statePath, { assets: [] }); }
  catch { state = { assets: [] }; }
  const owned = new Map((state.assets ?? []).map((asset) => [asset?.target, asset]));
  const skills = [];
  for (const asset of assets) {
    const file = join(base, asset.target, 'SKILL.md');
    const result = await readOptional(file);
    const name = result.exists ? skillName(result.text) : null;
    if (name) skills.push({ name, path: file, scope, asset, owned: owned.get(asset.target) });
  }
  return skills;
}

async function assetDrift(base, statePath, assets, scope) {
  const state = await readJson(statePath, { assets: [] }).catch(() => ({ assets: [] }));
  const owned = new Map((state.assets ?? []).map((asset) => [asset?.target, asset]));
  return Promise.all(assets.map(async (asset) => {
    const target = join(base, asset.target);
    const source = join(kitRoot, asset.source);
    const sourceHash = await pathHash(source);
    const present = exists(target);
    const symlink = present && (await lstat(target)).isSymbolicLink();
    const installedHash = present && !symlink ? await pathHash(target) : null;
    const record = owned.get(asset.target);
    const ownership = !present ? 'missing' : symlink ? 'unmanaged-divergent' : record ? record.hash === installedHash ? installedHash === sourceHash ? 'owned-current' : 'owned-outdated' : 'owned-modified' : installedHash === sourceHash ? 'unmanaged-current' : 'unmanaged-divergent';
    return { component: asset.component, target: asset.target, scope, ownership, sourceHash, installedHash };
  }));
}

function selectedComponents(text) {
  return [...text.matchAll(/^- (?:Global|Project) component: `([^`]+)`\.$/gm)].map((match) => match[1]);
}

async function activeAssets(base, agent, statePath, assets) {
  const state = await readJson(statePath, { assets: [] }).catch(() => ({ assets: [] }));
  const selected = new Set(selectedComponents(agent.text));
  const tracked = new Set((state.assets ?? []).map((asset) => asset?.target));
  return assets.filter((asset) => selected.has(asset.component) || tracked.has(asset.target));
}

async function brainPolicy(scope, agent, manifest) {
  const selected = selectedComponents(agent.text).includes('obsidian-brain');
  if (!selected) return { selected: false, state: 'unselected' };
  const source = await readFile(join(kitRoot, manifest.components['obsidian-brain'].source), 'utf8');
  return { selected: true, state: agent.text.includes(source) ? 'current' : agent.exists ? 'outdated' : 'missing' };
}

export async function contextStatus({ root = process.cwd(), home } = {}) {
  const [manifest, global, project] = await Promise.all([
    loadManifest(),
    agentFile(join(home, 'AGENTS.md'), 'global'),
    agentFile(join(root, 'AGENTS.md'), 'project')
  ]);
  const [globalAssets, projectAssets] = await Promise.all([
    activeAssets(home, global, join(home, '.codex-kit', 'global-assets.json'), declaredSkillAssets(manifest, 'global')),
    activeAssets(root, project, join(root, '.codex-kit', 'state.json'), declaredSkillAssets(manifest, 'project'))
  ]);
  const [globalSkills, projectSkills, globalAssetDrift, projectAssetDrift, globalBrainPolicy, projectBrainPolicy] = await Promise.all([
    declaredSkills(home, join(home, '.codex-kit', 'global-assets.json'), globalAssets, 'global'),
    declaredSkills(root, join(root, '.codex-kit', 'state.json'), projectAssets, 'project'),
    assetDrift(home, join(home, '.codex-kit', 'global-assets.json'), globalAssets, 'global'),
    assetDrift(root, join(root, '.codex-kit', 'state.json'), projectAssets, 'project'),
    brainPolicy('global', global, manifest),
    brainPolicy('project', project, manifest)
  ]);
  const grouped = new Map();
  for (const skill of [...globalSkills, ...projectSkills]) grouped.set(skill.name, [...(grouped.get(skill.name) ?? []), skill]);
  const duplicateSkills = [...grouped.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([name, entries]) => ({ name, paths: entries.map(({ path, scope }) => ({ path, scope })) }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const knownStaticBytes = global.totalBytes + project.totalBytes;
  const kitManagedStaticBytes = global.kitManagedBytes + project.kitManagedBytes;
  const brainPolicies = { global: globalBrainPolicy, project: projectBrainPolicy };
  const drift = [...globalAssetDrift, ...projectAssetDrift];
  const status = [global, project].some((item) => item.error) || Object.values(brainPolicies).some((policy) => policy.selected && policy.state !== 'current') ? 'partial' : 'ok';
  return {
    status,
    root,
    home,
    global,
    project,
    knownStaticBytes,
    kitManagedStaticBytes,
    brainRecallBudgetBytes: BRAIN_RECALL_BUDGET_BYTES,
    duplicateSkills,
    drift,
    brainPolicies,
    actions: [
      action('unchanged', 'global AGENTS context', `${global.totalBytes} bytes; ${global.kitManagedBytes} Kit-managed`),
      action('unchanged', 'project AGENTS context', `${project.totalBytes} bytes; ${project.kitManagedBytes} Kit-managed`),
      action('unchanged', 'known static context', `${knownStaticBytes} bytes total; ${kitManagedStaticBytes} Kit-managed`),
      action('unchanged', 'Brain recall budget', `${BRAIN_RECALL_BUDGET_BYTES} bytes`),
      ...drift.filter((item) => item.ownership !== 'owned-current').map((item) => action(item.ownership.includes('divergent') || item.ownership === 'owned-modified' ? 'warning' : 'recommended', `skill ${item.target}`, item.ownership)),
      ...Object.entries(brainPolicies).filter(([, policy]) => policy.selected && policy.state !== 'current').map(([scope, policy]) => action('warning', `${scope} Obsidian Brain policy`, policy.state)),
      ...duplicateSkills.map((skill) => action('warning', `duplicate Kit-owned skill: ${skill.name}`, skill.paths.map((item) => item.path).join(', ')))
    ]
  };
}
