import { randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWrite, exists, readJson } from './util.mjs';
import { pathHash } from './transaction.mjs';

const pendingPath = (home) => join(home, '.codex-kit', 'content-pending');
const statePath = (home) => join(home, '.codex-kit', 'content.json');
const globalPath = (home) => join(home, '.codex-kit', 'global-assets.json');
const hashPattern = /^[a-f0-9]{64}$/;

async function safeDirectory(path) {
  let info;
  try { info = await lstat(path); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe content directory: ' + path);
}

export async function assertContentHome(home) {
  await safeDirectory(home);
  await safeDirectory(join(home, 'skills'));
  await safeDirectory(join(home, '.codex-kit'));
  await safeDirectory(pendingPath(home));
}

export async function safeTreeHash(path) {
  let info;
  try { info = await lstat(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw new Error('Unsafe content skill path: ' + path);
  if (info.isDirectory()) for (const entry of await readdir(path)) await safeTreeHash(join(path, entry));
  return pathHash(path);
}

export function hasPendingContent(home) { return exists(pendingPath(home)); }

function validIntent(intent, source, ref) {
  if (!intent || intent.schemaVersion !== 1 || intent.source !== source || intent.ref !== ref ||
      typeof intent.name !== 'string' || !/^(video-(edit|motion|review)|higgsfield-[a-z-]+)$/.test(intent.name) ||
      (intent.beforeHash !== null && !hashPattern.test(intent.beforeHash)) ||
      !hashPattern.test(intent.afterHash)) throw new Error('Invalid or different pending content installation.');
  if (intent.legacyRow && (intent.legacyRow.target !== 'skills/' + intent.name ||
      intent.legacyRow.source !== 'workflow-skills/' + intent.name ||
      intent.legacyRow.component !== 'base-policy' ||
      intent.legacyRow.hash !== intent.beforeHash)) throw new Error('Invalid pending legacy receipt.');
}

function matchingLegacy(row, expected) {
  return row.target === expected.target && row.source === expected.source &&
    row.component === expected.component && row.hash === expected.hash;
}

export async function resumeContentSkill(home, source, ref) {
  await assertContentHome(home);
  const pending = pendingPath(home);
  const intent = await readJson(join(pending, 'intent.json'));
  validIntent(intent, source, ref);
  const target = join(home, 'skills', intent.name);
  const staged = join(pending, 'stage');
  const backup = join(pending, 'backup');
  const liveHash = await safeTreeHash(target);
  const stageHash = await safeTreeHash(staged);
  const backupHash = await safeTreeHash(backup);
  if (stageHash !== null && stageHash !== intent.afterHash) throw new Error('Pending staged skill changed: ' + intent.name);
  if (backupHash !== null && backupHash !== intent.beforeHash) throw new Error('Pending backup changed: ' + intent.name);
  if (liveHash !== intent.afterHash) {
    if (liveHash === intent.beforeHash && intent.beforeHash !== null && backupHash === null) {
      if (stageHash !== intent.afterHash) throw new Error('Pending stage missing: ' + intent.name);
      await rename(target, backup);
    } else if (liveHash !== null || (intent.beforeHash !== null && backupHash !== intent.beforeHash) ||
               (intent.beforeHash === null && backupHash !== null)) {
      throw new Error('Pending live skill changed: ' + intent.name);
    }
    if (await safeTreeHash(staged) !== intent.afterHash) throw new Error('Pending stage missing: ' + intent.name);
    await mkdir(join(home, 'skills'), { recursive: true });
    await rename(staged, target);
  }
  if (await safeTreeHash(target) !== intent.afterHash) throw new Error('Installed skill verification failed: ' + intent.name);
  const state = await readJson(statePath(home), { skills: {} });
  if (state.skills?.[intent.name] && ![intent.beforeHash, intent.afterHash].includes(state.skills[intent.name])) {
    throw new Error('Content receipt changed during installation: ' + intent.name);
  }
  await atomicWrite(statePath(home), JSON.stringify({
    source, ref, skills: { ...state.skills, [intent.name]: intent.afterHash }
  }, null, 2) + '\n');
  if (intent.legacyRow) {
    const global = await readJson(globalPath(home), { assets: [] });
    if (!Array.isArray(global.assets)) throw new Error('Invalid global assets state.');
    const rows = global.assets.filter((row) => row.target === intent.legacyRow.target);
    if (rows.length > 1 || (rows.length === 1 && !matchingLegacy(rows[0], intent.legacyRow))) {
      throw new Error('Global receipt changed during installation: ' + intent.name);
    }
    if (rows.length) await atomicWrite(globalPath(home), JSON.stringify({
      ...global, assets: global.assets.filter((row) => !matchingLegacy(row, intent.legacyRow))
    }, null, 2) + '\n');
  }
  const completed = pending + '-done-' + randomUUID();
  await rename(pending, completed);
  await rm(completed, { recursive: true });
}

export async function applyContentSkill({ home, source, ref, name, stagedSkill, beforeHash, afterHash, legacyRow }) {
  await assertContentHome(home);
  if (hasPendingContent(home)) throw new Error('Resume pending content installation before starting another.');
  if (beforeHash !== null && !hashPattern.test(beforeHash) || !hashPattern.test(afterHash)) throw new Error('Invalid content skill hash.');
  const build = join(home, '.codex-kit', 'content-build-' + randomUUID());
  await mkdir(build, { recursive: true });
  try {
    await cp(stagedSkill, join(build, 'stage'), { recursive: true, dereference: false, errorOnExist: true });
    if (await safeTreeHash(join(build, 'stage')) !== afterHash) throw new Error('Staged content skill mismatch: ' + name);
    await atomicWrite(join(build, 'intent.json'), JSON.stringify({
      schemaVersion: 1, source, ref, name, beforeHash, afterHash, legacyRow
    }, null, 2) + '\n');
    await rename(build, pendingPath(home));
  } catch (error) {
    await rm(build, { recursive: true, force: true });
    throw error;
  }
  await resumeContentSkill(home, source, ref);
}
