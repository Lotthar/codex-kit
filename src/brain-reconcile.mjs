import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { brainSnapshot, brainTopicSlug, openBrainVault } from './obsidian.mjs';
import { action, atomicWrite, exists, readJson } from './util.mjs';
import { withLock } from './transaction.mjs';

const STATE_VERSION = 1;
const STATE_FILE = 'brain-reconcile.json';
const LOCK_DIR = 'brain-reconcile.lock';
const GENERATED_ROOT = 'CodexKit/Brain';
const safeKey = /^[a-z0-9][a-z0-9-]{0,79}$/;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const statePath = (home) => join(home, '.codex-kit', STATE_FILE);
const lockPath = (home) => join(home, '.codex-kit', LOCK_DIR);
const wiki = (path, title) => `[[${path.replace(/\.md$/, '')}${title ? `|${title.replace(/[\[\]|]/g, '')}` : ''}]]`;

function generated(content) { return `<!-- codex-kit:brain-generated -->\n${content}`; }
function safeState(value) {
  if (!value || typeof value !== 'object' || value.version !== STATE_VERSION || !value.generated || typeof value.generated !== 'object') return null;
  if (Object.values(value.generated).some((item) => !item || typeof item !== 'object' || !/^[a-f0-9]{64}$/.test(item.hash ?? ''))) return null;
  return value;
}
async function loadState(home) {
  await safeLocal(home, statePath(home));
  if (!exists(statePath(home))) return { version: STATE_VERSION, generated: {}, outcomes: {} };
  try { return safeState(await readJson(statePath(home))) ?? null; } catch { return null; }
}
async function saveState(home, state) { await safeLocal(home, statePath(home)); await atomicWrite(statePath(home), `${JSON.stringify(state, null, 2)}\n`); }
async function safeLocal(home, path) {
  const root = await realpath(resolve(home)).catch(() => resolve(home));
  const target = resolve(path);
  if (relative(root, target).startsWith('..')) throw new Error('Brain reconciliation state escapes Codex home.');
  let current = resolve(home);
  for (const part of relative(resolve(home), target).split(sep).filter(Boolean)) {
    current = join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symlink in Brain reconciliation state: ${current}`); } catch (error) { if (error.code === 'ENOENT') break; throw error; }
  }
}
function outcome(record) {
  const { path, project, key, kind, title, summary, sources, supersedes, topics, hash: noteHash, classification, metadata } = record;
  return { path, project, key, kind, title, summary, sources, supersedes, topics, hash: noteHash, classification, metadata };
}
function eligibleProjects(projects, projectKey, scope) {
  const known = new Map((projects ?? []).filter((project) => project && safeKey.test(project.key ?? '')).map((project) => [project.key, project]));
  const included = [...known.values()].filter((project) => project.inclusion === 'included');
  if (scope === 'project' && projectKey) return included.filter((project) => project.key === projectKey);
  return included;
}
function contents(projects, records, collisions) {
  const safe = records.filter((record) => ['home', 'valid', 'superseded', 'unresolved'].includes(record.classification) && projects.some((project) => project.key === record.project));
  const pages = new Map();
  const projectLinks = projects.map((project) => wiki(`${GENERATED_ROOT}/Projects/${project.key}.md`, project.name || project.key));
  pages.set(`${GENERATED_ROOT}/Catalog.md`, generated(`# Codex Kit Brain Catalog\n\n${projectLinks.join('\n')}\n`));
  const topics = new Map();
  for (const project of projects) {
    const rows = safe.filter((record) => record.project === project.key).sort((a, b) => a.path.localeCompare(b.path));
    const home = rows.find((record) => record.kind === 'home' || record.path.endsWith('/Home.md'));
    const notes = rows.filter((record) => record !== home && record.classification === 'valid').map((record) => wiki(record.path, record.title || record.key));
    const history = rows.filter((record) => ['superseded', 'unresolved'].includes(record.classification)).map((record) => wiki(record.path, record.title || record.key));
    const topicNames = [...new Set([...(project.topics ?? []), ...rows.flatMap((record) => record.topics ?? [])])].filter((topic) => typeof topic === 'string' && topic.trim());
    const topicLinks = topicNames.map((topic) => {
      const slug = brainTopicSlug(topic);
      if (!topics.has(slug)) topics.set(slug, { name: topic, projects: [] });
      else if (topics.get(slug).name !== topic) collisions.push(`topic:${slug}`);
      topics.get(slug).projects.push(project);
      return wiki(`${GENERATED_ROOT}/Topics/${slug}.md`, topic);
    });
    pages.set(`${GENERATED_ROOT}/Projects/${project.key}.md`, generated(`# ${project.name || project.key}\n\n${home ? `Home: ${wiki(home.path, home.title || 'Project Brain')}\n\n` : ''}${topicLinks.length ? `Topics: ${topicLinks.join(', ')}\n\n` : ''}${notes.length ? `## Notes\n\n${notes.join('\n')}\n\n` : ''}${history.length ? `## History and unresolved\n\n${history.join('\n')}\n` : notes.length ? '' : 'No safe original notes were found.\n'}`));
  }
  for (const [slug, topic] of topics) {
    const unique = [...new Map(topic.projects.map((project) => [project.key, project])).values()].sort((a, b) => a.key.localeCompare(b.key));
    pages.set(`${GENERATED_ROOT}/Topics/${slug}.md`, generated(`# ${topic.name}\n\n${unique.map((project) => wiki(`${GENERATED_ROOT}/Projects/${project.key}.md`, project.name || project.key)).join('\n')}\n`));
  }
  return pages;
}
export async function brainReconcileStatus({ home }) {
  const state = await loadState(home);
  if (!state) return { status: 'partial', state: 'invalid', actions: [action('failed', 'read Brain reconciliation state', 'State is malformed; run a preview before applying changes.')] };
  if (!exists(statePath(home))) return { status: 'partial', state: 'missing', actions: [action('recommended', 'reconcile Brain data', 'No reconciliation receipt exists.')] };
  return { status: state.pending ? 'partial' : 'ok', state: state.pending ? 'pending' : 'complete', generated: Object.keys(state.generated).length, actions: [action(state.pending ? 'recommended' : 'unchanged', 'read Brain reconciliation state', state.pending ? 'A reconciliation is pending.' : 'Complete.')] };
}

export async function brainReconcile({ home, projects = [], projectKey, scope = 'all', execute = false, runner }) {
  const targets = eligibleProjects(projects, undefined, 'all');
  const targetKeys = targets.map((project) => project.key);
  // The adapter filters paths before reading, so excluded note bodies never enter this process.
  const snapshot = await brainSnapshot({ home, projectKeys: targetKeys, runner });
  const outcomes = (snapshot.records ?? []).map(outcome);
  const listedVault = await openBrainVault({ home, runner });
  const listed = listedVault.status === 'ok' ? await listedVault.list('Projects') : { status: 1, stdout: '' };
  const foreignKeys = listed.status === 0 ? [...new Set(String(listed.stdout).split(/\r?\n/).map((path) => path.match(/^Projects\/([^/]+)\//)?.[1]).filter((key) => key && !targetKeys.includes(key)))] : [];
  const unmatched = foreignKeys.map((project) => ({ project, classification: 'unmatched' }));
  const collisions = [];
  const pages = contents(targets, outcomes, collisions);
  const state = await loadState(home);
  const actions = [...(snapshot.actions ?? [])];
  const proposed = [...pages.keys()].sort();
  const base = { checked: outcomes.length, outcomes, proposed, changed: [], conflicts: [...new Set(collisions)], indexState: snapshot.complete ? 'ready' : 'partial', unmatched, actions };
  const relevantUnsafe = outcomes.some((record) => ['unreadable', 'malformed', 'unsafe'].includes(record.classification));
  if (!snapshot.complete || relevantUnsafe) return { status: 'partial', complete: false, ...base, actions: [...actions, action('failed', 'reconcile Brain data', 'The included source scan was incomplete or unsafe; no generated pages were changed.')] };
  if (!state) return { status: 'partial', complete: false, ...base, actions: [...actions, action('failed', 'read Brain reconciliation state', 'State is malformed; no changes were made.')] };
  const preflight = async (vault) => {
    for (const [path, content] of [...pages].sort(([a], [b]) => a.localeCompare(b))) {
      const current = await vault.read(path); const prior = state.generated[path];
      if (current.status !== 0) { base.changed.push(path); continue; }
      const currentHash = hash(current.stdout ?? '');
      if (state.intent?.path === path && (state.intent.hash === currentHash || current.stdout === content)) continue;
      if (!prior || currentHash !== prior.hash) base.conflicts.push(path);
      else if (currentHash !== hash(content)) base.changed.push(path);
    }
    base.conflicts = [...new Set(base.conflicts)]; base.changed = [...new Set(base.changed)];
  };
  if (listedVault.status !== 'ok') return { status: 'partial', complete: false, ...base, actions: [...actions, ...(listedVault.actions ?? [])] };
  await preflight(listedVault);
  // A pending intent is re-verified in the locked write loop below. It must not
  // become a stale preflight conflict between the remote write and receipt save.
  if (execute && state.intent?.path) base.conflicts = base.conflicts.filter((path) => path !== state.intent.path);
  if (!execute) return { status: base.conflicts.length ? 'partial' : 'ok', complete: !base.conflicts.length, ...base, actions: [...actions, action(base.conflicts.length ? 'failed' : base.changed.length ? 'planned' : 'unchanged', 'reconcile Brain graph', `${base.changed.length} changes; ${base.conflicts.length} conflicts`)] };
  if (base.conflicts.length) return { status: 'partial', complete: false, ...base, actions: [...actions, action('failed', 'reconcile Brain graph', 'Generated page paths conflict; no pages were changed.')] };
  try { return await withLock(home, async () => {
    const vault = await openBrainVault({ home, runner });
    if (vault.status !== 'ok') return { status: 'partial', complete: false, ...base, actions: [...actions, ...(vault.actions ?? []), action('failed', 'open Brain vault', 'No pages were changed.')] };
    const next = { version: STATE_VERSION, generated: { ...state.generated }, outcomes: Object.fromEntries(outcomes.map((record) => [record.path, { hash: record.hash, classification: record.classification }])), ...(state.intent ? { intent: state.intent } : {}) };
    base.changed = [];
    for (const [path, content] of [...pages].sort(([left], [right]) => left.localeCompare(right))) {
      const prior = next.generated[path];
      const current = await vault.read(path);
      if (current.status === 0) {
        const currentHash = hash(current.content ?? current.stdout ?? '');
        if (next.intent?.path === path && (next.intent.hash === currentHash || current.stdout === content)) {
          next.generated[path] = { hash: currentHash };
          delete next.intent;
          await saveState(home, next);
          continue;
        }
        if (prior && currentHash !== prior.hash) { base.conflicts.push(path); continue; }
        if (prior && currentHash === hash(content)) continue;
        if (!prior) { base.conflicts.push(path); continue; }
        const backupPath = `${GENERATED_ROOT}/Backups/${currentHash}.md`;
        const backupRead = await vault.read(backupPath);
        const backup = backupRead.status === 0 && hash(backupRead.stdout ?? '') === currentHash ? backupRead : await vault.writeGenerated(backupPath, current.content ?? current.stdout ?? '');
        if (backup.status !== 0) { next.pending = true; await saveState(home, next); return { status: 'partial', complete: false, ...base, actions: [...actions, ...(backup.actions ?? []), action('failed', 'back up generated Brain page', path)] }; }
        const verifiedBackup = await vault.read(backupPath);
        if (verifiedBackup.status !== 0 || hash(verifiedBackup.stdout ?? '') !== currentHash) { next.pending = true; await saveState(home, next); return { status: 'partial', complete: false, ...base, actions: [...actions, action('failed', 'verify generated Brain backup', path)] }; }
        next.generated[path] = { ...prior, backupPath };
        await saveState(home, next);
      }
      next.pending = true; next.intent = { path, hash: hash(content) }; await saveState(home, next);
      const written = await vault.writeGenerated(path, content, Boolean(prior));
      if (written.status !== 0) { next.pending = true; await saveState(home, next); return { status: 'partial', complete: false, ...base, changed: base.changed, actions: [...actions, ...(written.actions ?? []), action('failed', 'write generated Brain page', path)] }; }
      const verified = await vault.read(path);
      if (verified.status !== 0 || hash(verified.content ?? verified.stdout ?? '') !== hash(content)) { next.pending = true; await saveState(home, next); return { status: 'partial', complete: false, ...base, changed: base.changed, actions: [...actions, action('failed', 'verify generated Brain page', path)] }; }
      next.generated[path] = { hash: hash(content) };
      await saveState(home, next);
      base.changed.push(path);
    }
    const after = await brainSnapshot({ home, projectKeys: targetKeys, runner });
    const beforeHashes = new Map(outcomes.map((record) => [record.path, record.hash]));
    const afterHashes = new Map((after.records ?? []).map((record) => [record.path, record.hash]));
    if (!after.complete || beforeHashes.size !== afterHashes.size || [...beforeHashes].some(([path, value]) => afterHashes.get(path) !== value)) return { status: 'partial', complete: false, ...base, actions: [...actions, action('failed', 'preserve original Brain notes', 'Original note content changed during reconciliation.')] };
    next.pending = false; delete next.intent; await saveState(home, next);
    return { status: base.conflicts.length ? 'partial' : 'ok', complete: !base.conflicts.length, ...base, actions: [...actions, action(base.conflicts.length ? 'recommended' : base.changed.length ? 'changed' : 'unchanged', 'reconcile Brain graph', `${base.changed.length} changed; ${base.conflicts.length} conflicts`)] };
  }); } catch (error) { return { status: 'partial', complete: false, ...base, actions: [...actions, action('failed', 'reconcile Brain graph', error.message)] }; }
}
