import { readFile } from 'node:fs/promises';
import { isAbsolute, join, win32 } from 'node:path';
import { markers } from './managed.mjs';
import { loadManifest } from './manifest.mjs';
import { action, readJson } from './util.mjs';
import { BRAIN_RECALL_BUDGET_BYTES } from './obsidian.mjs';

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
  return {
    path,
    exists: result.exists,
    totalBytes,
    kitManagedBytes,
    humanBytes: totalBytes - kitManagedBytes,
    ...(result.error ? { error: result.error } : {})
  };
}

function safeTarget(target) {
  return typeof target === 'string'
    && target.length > 0
    && !isAbsolute(target)
    && !win32.isAbsolute(target)
    && !target.split(/[\\/]/).includes('..');
}

function declaredSkillTargets(manifest, scope) {
  return new Set(Object.values(manifest.components).flatMap((component) => {
    const assets = scope === 'global' ? component.globalAssets : component.assets;
    return (assets ?? []).map((asset) => asset.target).filter((target) => safeTarget(target) && /(?:^|[\\/])skills[\\/][^\\/]+$/.test(target));
  }));
}

function skillName(text) {
  const match = text.match(/^name:\s*["']?([^\r\n"']+)["']?\s*$/m);
  return match?.[1].trim() || null;
}

async function trackedSkills(base, statePath, targets, scope) {
  let state;
  try { state = await readJson(statePath, { assets: [] }); }
  catch { return []; }
  if (!Array.isArray(state?.assets)) return [];
  const owned = new Set(state.assets.map((asset) => asset?.target).filter((target) => targets.has(target)));
  const skills = [];
  for (const target of owned) {
    const file = join(base, target, 'SKILL.md');
    const result = await readOptional(file);
    const name = result.exists ? skillName(result.text) : null;
    if (name) skills.push({ name, path: file, scope });
  }
  return skills;
}

export async function contextStatus({ root = process.cwd(), home } = {}) {
  const [manifest, global, project] = await Promise.all([
    loadManifest(),
    agentFile(join(home, 'AGENTS.md'), 'global'),
    agentFile(join(root, 'AGENTS.md'), 'project')
  ]);
  const [globalSkills, projectSkills] = await Promise.all([
    trackedSkills(home, join(home, '.codex-kit', 'global-assets.json'), declaredSkillTargets(manifest, 'global'), 'global'),
    trackedSkills(root, join(root, '.codex-kit', 'state.json'), declaredSkillTargets(manifest, 'project'), 'project')
  ]);
  const grouped = new Map();
  for (const skill of [...globalSkills, ...projectSkills]) grouped.set(skill.name, [...(grouped.get(skill.name) ?? []), skill]);
  const duplicateSkills = [...grouped.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([name, entries]) => ({ name, paths: entries.map(({ path, scope }) => ({ path, scope })) }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const knownStaticBytes = global.totalBytes + project.totalBytes;
  const kitManagedStaticBytes = global.kitManagedBytes + project.kitManagedBytes;
  const status = [global, project].some((item) => item.error) ? 'partial' : 'ok';
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
    actions: [
      action('unchanged', 'global AGENTS context', `${global.totalBytes} bytes; ${global.kitManagedBytes} Kit-managed`),
      action('unchanged', 'project AGENTS context', `${project.totalBytes} bytes; ${project.kitManagedBytes} Kit-managed`),
      action('unchanged', 'known static context', `${knownStaticBytes} bytes total; ${kitManagedStaticBytes} Kit-managed`),
      action('unchanged', 'Brain recall budget', `${BRAIN_RECALL_BUDGET_BYTES} bytes`),
      ...duplicateSkills.map((skill) => action('warning', `duplicate Kit-owned skill: ${skill.name}`, skill.paths.map((item) => item.path).join(', ')))
    ]
  };
}
