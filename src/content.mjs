import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile, lstat, readlink } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { action, atomicWrite, readJson } from './util.mjs';
import { applyContentSkill, assertContentHome, hasPendingContent, resumeContentSkill, safeTreeHash } from './content-apply.mjs';
import { withLock, pathHash } from './transaction.mjs';

const names = ['video-edit', 'video-motion', 'video-review'];
const higgsfield = ['higgsfield-brandkit', 'higgsfield-creative-director', 'higgsfield-faceless-video', 'higgsfield-generate', 'higgsfield-marketplace-cards', 'higgsfield-product-photoshoot', 'higgsfield-soul-id', 'higgsfield-video-explainer', 'higgsfield-websites', 'higgsfield-youtube-thumbnail'];
const allNames = [...names, ...higgsfield];
const legacy = ['setup-streamer-stack', 'verify-private-stream', 'design-ai-stream-host', 'manage-creator-content'];
const statePath = (home) => join(home, '.codex-kit', 'content.json');

function git(source, args, encoding = 'utf8') {
  const result = spawnSync('git', ['-C', source, ...args], { encoding, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' } });
  if (result.status !== 0) throw new Error(`Git content source error: ${String(result.stderr).trim()}`);
  return result.stdout;
}

async function stage(source, ref, directory) {
  if (!source || !/^[a-f0-9]{40}$/.test(ref || '')) throw new Error('Specify --source and a full 40-character commit --ref.');
  const commit = git(source, ['rev-parse', '--verify', `${ref}^{commit}`]).trim();
  if (commit !== ref) throw new Error('The content ref must be an exact commit.');
  const list = git(source, ['ls-tree', '-rz', '--full-tree', ref, '--', ...allNames.map((name) => `.agents/skills/${name}`)]);
  for (const entry of list.split('\0').filter(Boolean)) {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(\.agents\/skills\/(video-edit|video-motion|video-review|higgsfield-brandkit|higgsfield-creative-director|higgsfield-faceless-video|higgsfield-generate|higgsfield-marketplace-cards|higgsfield-product-photoshoot|higgsfield-soul-id|higgsfield-video-explainer|higgsfield-websites|higgsfield-youtube-thumbnail)\/(.+))$/.exec(entry);
    if (!match || match[5].split('/').some((part) => !part || part === '.' || part === '..' ||
        /[\\:*?"<>|\x00-\x1f]/.test(part) || /[. ]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part))) {
      throw new Error('Content tree contains an unsafe path, symlink, or submodule.');
    }
    const file = join(directory, match[4], match[5]);
    const location = relative(directory, file);
    if (isAbsolute(location) || location === '..' || location.startsWith('..' + sep)) throw new Error('Content path escapes staging directory.');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, git(source, ['cat-file', 'blob', match[2]], null));
    await chmod(file, match[1] === '100755' ? 0o755 : 0o644);
  }
  for (const name of allNames) {
    const skill = await readFile(join(directory, name, 'SKILL.md'), 'utf8');
    const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    const declared = frontmatter?.[1].split(/\r?\n/).filter((line) => line.startsWith('name: '));
    if (declared?.length !== 1 || declared[0].slice(6).trim() !== name) throw new Error('Invalid skill name: ' + name);
    if (higgsfield.includes(name)) {
      const policy = await readFile(join(directory, name, 'agents', 'openai.yaml'), 'utf8');
      if (!/^\s*allow_implicit_invocation:\s*false\s*$/m.test(policy)) throw new Error('Higgsfield skill must remain explicit-only: ' + name);
    }
  }
  return commit;
}

async function legacyActions(source, userHome) {
  const actions = [];
  for (const name of legacy) {
    const path = join(userHome, '.agents', 'skills', name);
    try {
      const info = await lstat(path);
      const target = info.isSymbolicLink() ? resolve(dirname(path), await readlink(path)) : null;
      actions.push(action(target === join(source, '.agents', 'skills', name) ? 'unchanged' : 'conflict', `legacy ${name}`, target === join(source, '.agents', 'skills', name) ? 'existing link preserved' : 'existing path preserved'));
    } catch (error) { if (error.code !== 'ENOENT') throw error; actions.push(action('skipped', `legacy ${name}`, 'not installed')); }
  }
  return actions;
}

async function duplicateActions(userHome) {
  const actions = [];
  for (const name of allNames) {
    const path = join(userHome, '.agents', 'skills', name);
    try {
      await lstat(path);
      actions.push(action('conflict', 'alternate ' + name, 'duplicate user skill exists; preserved'));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return actions;
}

export async function contentStatus({ home, userHome = homedir() }) {
  await assertContentHome(home);
  const state = await readJson(statePath(home), { skills: {} });
  const actions = [];
  if (hasPendingContent(home)) actions.push(action('warning', 'content installation', 'pending operation requires resume'));
  const temp = await mkdtemp(join(tmpdir(), 'codex-kit-content-status-'));
  try {
    let staged = false;
    if (state.source && state.ref) {
      try { await stage(state.source, state.ref, temp); staged = true; }
      catch (error) { actions.push(action('warning', 'content source', `cannot verify pinned content: ${error.message}`)); }
    }
    for (const name of allNames) {
      const path = join(home, 'skills', name);
      let current;
      try { current = await safeTreeHash(path); }
      catch (error) { actions.push(action('conflict', name, error.message)); continue; }
      if (current === null) { actions.push(action('warning', name, 'not installed')); continue; }
      if (state.skills?.[name] !== current) actions.push(action('conflict', name, 'modified or unowned; preserved'));
      else if (staged && current !== await pathHash(join(temp, name))) actions.push(action('warning', name, 'upgrade pending'));
      else actions.push(action('unchanged', name, 'matches content receipt'));
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
  if (state.source) actions.push(...await legacyActions(state.source, userHome));
  actions.push(...await duplicateActions(userHome));
  return { status: actions.some((item) => ['warning', 'conflict'].includes(item.state)) ? 'partial' : 'ok', source: state.source, ref: state.ref, actions };
}

export async function contentSetup({ home, source, ref, execute = false, userHome = homedir() }) {
  source = resolve(source || '.');
  const temp = await mkdtemp(join(tmpdir(), 'codex-kit-content-'));
  try {
    await stage(source, ref, temp);
    const plan = async (apply) => {
      await assertContentHome(home);
      if (hasPendingContent(home)) {
        if (!apply) return { status: 'partial', source, ref,
          actions: [action('warning', 'content installation', 'resume pending operation with --yes')] };
        await resumeContentSkill(home, source, ref);
      }
      const state = await readJson(statePath(home), { skills: {} });
      const globalPath = join(home, '.codex-kit', 'global-assets.json');
      const global = await readJson(globalPath, { assets: [] });
      if (!Array.isArray(global.assets)) throw new Error('Invalid global assets state.');
      const actions = [...await legacyActions(source, userHome), ...await duplicateActions(userHome)];
      const changes = [];
      for (const name of allNames) {
        const target = join(home, 'skills', name);
        const desired = await pathHash(join(temp, name));
        const current = await safeTreeHash(target);
        const rows = global.assets.filter((asset) => asset.target === 'skills/' + name);
        if (rows.length > 1) throw new Error('Duplicate global receipt for ' + name);
        const legacyRow = rows[0] && rows[0].component === 'base-policy' &&
          rows[0].source === 'workflow-skills/' + name ? rows[0] : null;
        const contentOwned = current !== null && state.skills?.[name] === current;
        const kitOwned = higgsfield.includes(name) && legacyRow?.hash === current &&
          (!state.skills?.[name] || contentOwned);
        if (current !== null && !contentOwned && !kitOwned ||
            current === null && (state.skills?.[name] || legacyRow) ||
            rows.length && !legacyRow && !contentOwned) {
          actions.push(action('conflict', name, 'modified, missing, or unowned skill preserved'));
          continue;
        }
        if (current === desired && contentOwned && !legacyRow) {
          actions.push(action('unchanged', name, 'already matches pinned content'));
          continue;
        }
        actions.push(action('planned', name,
          current === desired ? 'transfer verified ownership' : 'install pinned skill'));
        changes.push({ name, stagedSkill: join(temp, name), beforeHash: current,
          afterHash: desired, legacyRow });
      }
      if (actions.some((item) => item.state === 'conflict')) return { status: 'conflict', source, ref, actions };
      if (apply) {
        for (const change of changes) {
          await applyContentSkill({ home, source, ref, ...change });
          actions.find((item) => item.label === change.name).state = 'changed';
        }
        const installed = await readJson(statePath(home), { skills: {} });
        await atomicWrite(statePath(home), JSON.stringify({
          source, ref, skills: installed.skills ?? {}
        }, null, 2) + '\n');
      }
      return { status: 'ok', source, ref, actions };
    };
    return execute ? await withLock(home, () => plan(true)) : await plan(false);
  } finally { await rm(temp, { recursive: true, force: true }); }
}
