import { randomUUID } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { action, exists, readJson } from './util.mjs';
import { beginTransaction, finishTransaction, withLock, writeTracked } from './transaction.mjs';

const KEY = /^[a-z0-9][a-z0-9-]{0,79}$/;
const NAME = /^[^\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]{1,160}$/;
const TOPIC = /^[^\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]{1,80}$/;
const INCLUSIONS = new Set(['included', 'excluded', 'pending']);
const secret = /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|\b(?:sk|rk|pk)_(?:live|test)_[a-z0-9]{16,}\b|\bsk-[a-z0-9_-]{20,}\b|\bgh[pousr]_[a-z0-9]{20,}\b|\bAKIA[0-9A-Z]{16}\b|\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b|\b(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*[^\s]{8,}|\bhttps?:\/\/[^\s/@:]+:[^\s/@]+@/i;

export const brainRegistryPath = (home) => resolve(home, '.codex-kit', 'brain-registry.json');

function defaultRegistry() { return { schemaVersion: 1, defaultScope: 'related', projects: [] }; }
function within(root, candidate) { const rel = relative(resolve(root), resolve(candidate)); return !rel.startsWith('..') && !isAbsolute(rel); }

async function assertSafeRegistryPath(home) {
  const target = brainRegistryPath(home);
  if (!within(home, target)) throw new Error(`Brain registry escapes Codex home: ${target}`);
  const resolvedHome = await realpath(resolve(home)).catch((error) => error.code === 'ENOENT' ? resolve(home) : Promise.reject(error));
  let current = resolve(home);
  for (const part of relative(resolve(home), target).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() && !within(resolvedHome, await realpath(current))) throw new Error(`Symlink escapes Codex home: ${current}`);
    } catch (error) { if (error.code === 'ENOENT') break; throw error; }
  }
  try { if ((await lstat(target)).isSymbolicLink()) throw new Error(`Refusing symlinked brain registry: ${target}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return target;
}

function assertText(value, label, pattern) {
  if (typeof value !== 'string' || value !== value.trim() || !pattern.test(value) || Buffer.byteLength(value) > 4096 || secret.test(value)) throw new Error(`Invalid brain registry ${label}.`);
  return value;
}
function validateKey(key) { return assertText(key, 'project key', KEY); }
function validateName(name) { return assertText(name, 'project name', NAME); }
function validateRoot(root) {
  if (typeof root !== 'string' || !isAbsolute(root) || root !== root.trim() || /[\u0000-\u001F\u007F-\u009F]/.test(root) || Buffer.byteLength(root) > 2048 || secret.test(root)) throw new Error('Invalid brain registry project root.');
  return resolve(root);
}
function validateExternalId(externalId) { return assertText(externalId, 'external ID', NAME); }
function validateTopics(topics) {
  if (!Array.isArray(topics) || topics.length > 20) throw new Error('Invalid brain registry topics.');
  const normalized = [...new Set(topics.map((topic) => assertText(topic, 'topic', TOPIC)))];
  if (normalized.length !== topics.length) throw new Error('Duplicate brain registry topics.');
  return normalized;
}
function validateInclusion(inclusion) { if (!INCLUSIONS.has(inclusion)) throw new Error('Invalid brain registry inclusion.'); return inclusion; }
function kindFor(entry) { return entry.kind ?? (entry.externalId ? 'external' : 'projectless'); }
function publicEntry(entry) { return { key: entry.key, name: entry.name, kind: kindFor(entry), root: entry.root ?? null, roots: entry.roots ?? [], externalId: entry.externalId ?? null, topics: entry.topics ?? [], inclusion: entry.inclusion }; }

function validateRegistry(value) {
  if (!value || value.schemaVersion !== 1 || value.defaultScope !== 'related' || !Array.isArray(value.projects)) throw new Error('Invalid brain registry.');
  const keys = new Set(); const roots = new Set(); const externalIds = new Set(); const projects = [];
  for (const raw of value.projects) {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid brain registry project.');
    const entry = publicEntry({ ...raw, key: validateKey(raw.key), name: validateName(raw.name), root: raw.root === null ? null : raw.root, roots: raw.roots, externalId: raw.externalId === null ? null : raw.externalId, topics: raw.topics, inclusion: validateInclusion(raw.inclusion) });
    if (!['git', 'projectless', 'external'].includes(entry.kind)) throw new Error('Invalid brain registry project kind.');
    if (entry.root !== null) entry.root = validateRoot(entry.root);
    if (!Array.isArray(entry.roots) || entry.roots.length > 20) throw new Error('Invalid brain registry project roots.');
    entry.roots = [...new Set(entry.roots.map(validateRoot))];
    entry.externalId = entry.externalId === null ? null : validateExternalId(entry.externalId);
    entry.topics = validateTopics(entry.topics);
    if (entry.root && !entry.roots.includes(entry.root)) throw new Error('Brain registry root must be listed in roots.');
    if (entry.kind === 'external' && !entry.externalId) throw new Error('External brain registry project requires an external ID.');
    if (keys.has(entry.key)) throw new Error('Duplicate brain registry project key.'); keys.add(entry.key);
    for (const root of entry.roots) { if (roots.has(root)) throw new Error('Duplicate brain registry project root.'); roots.add(root); }
    if (entry.externalId) { if (externalIds.has(entry.externalId)) throw new Error('Duplicate brain registry external ID.'); externalIds.add(entry.externalId); }
    projects.push(entry);
  }
  return { schemaVersion: 1, defaultScope: 'related', projects };
}

export async function loadBrainRegistry({ home }) {
  const path = await assertSafeRegistryPath(home);
  if (!exists(path)) return defaultRegistry();
  return validateRegistry(await readJson(path));
}

function generatedKey() { return `project-${randomUUID().replace(/-/g, '').slice(0, 16)}`; }
function findMappedProject(projects, root, externalId) {
  return projects.find((entry) => (root && entry.roots.includes(root)) || (externalId && entry.externalId === externalId));
}

export async function brainRegister({ home, key, name, root, externalId, topics, inclusion, kind, execute = false }) {
  if (key !== undefined) key = validateKey(key);
  if (name !== undefined) name = validateName(name);
  if (root !== undefined) root = validateRoot(root);
  if (externalId !== undefined) externalId = validateExternalId(externalId);
  if (topics !== undefined) topics = validateTopics(topics);
  if (inclusion !== undefined) inclusion = validateInclusion(inclusion);
  if (kind !== undefined && !['git', 'projectless', 'external'].includes(kind)) throw new Error('Invalid brain registry project kind.');
  if (!key && !root && !externalId) throw new Error('A brain registry key, root, or external ID is required.');
  const apply = async () => {
    const registry = await loadBrainRegistry({ home });
    const mapped = findMappedProject(registry.projects, root, externalId);
    const byKey = key && registry.projects.find((entry) => entry.key === key);
    if (mapped && byKey && mapped !== byKey) throw new Error('Brain registry root or external ID already belongs to another key.');
    if (key && mapped && mapped.key !== key) throw new Error('Brain registry root or external ID already belongs to another key.');
    const existing = byKey || mapped;
    if (!existing && !name) throw new Error('A project name is required for a new brain registry entry.');
    const projectKey = existing?.key || key || (execute ? generatedKey() : null);
    const next = publicEntry({
      key: projectKey || 'project-preview', name: name ?? existing?.name, kind: kind ?? existing?.kind ?? (externalId ? 'external' : 'projectless'), root: root ?? existing?.root ?? null,
      roots: [...new Set([...(existing?.roots ?? []), ...(root ? [root] : [])])], externalId: externalId ?? existing?.externalId ?? null,
      topics: topics ?? existing?.topics ?? [], inclusion: inclusion ?? existing?.inclusion ?? 'included',
    });
    if (next.root && !next.roots.includes(next.root)) next.roots.push(next.root);
    if (!execute) return { status: 'ok', registered: false, project: projectKey ? next : { ...next, key: null }, actions: [action('planned', 'register brain project', projectKey || 'allocate project key on apply')], transactionId: null };
    if (existing && JSON.stringify(existing) === JSON.stringify(next)) return { status: 'ok', registered: true, project: next, actions: [action('unchanged', 'register brain project', next.key)], transactionId: null };
    const projects = existing ? registry.projects.map((entry) => entry === existing ? next : entry) : [...registry.projects, next];
    validateRegistry({ ...registry, projects });
    const transaction = await beginTransaction(home, 'brain-registry');
    try {
      await writeTracked(transaction, brainRegistryPath(home), `${JSON.stringify({ ...registry, projects }, null, 2)}\n`);
      const receipt = await finishTransaction(transaction);
      return { status: 'ok', registered: true, project: next, actions: [action('changed', 'register brain project', next.key)], transactionId: receipt.id };
    } catch (error) { await finishTransaction(transaction, 'failed'); throw error; }
  };
  return execute ? withLock(home, apply) : apply();
}

export async function brainRekey({ home, fromKey, toKey, execute = false }) {
  fromKey = validateKey(fromKey);
  toKey = validateKey(toKey);
  if (fromKey === toKey) return { status: 'ok', rekeyed: false, actions: [action('unchanged', 'rekey brain project', fromKey)], transactionId: null };
  const apply = async () => {
    const registry = await loadBrainRegistry({ home });
    const source = registry.projects.find((entry) => entry.key === fromKey);
    const destination = registry.projects.find((entry) => entry.key === toKey);
    if (!source) {
      if (destination) return { status: 'partial', rekeyed: false, actions: [action('conflict', 'rekey brain project', `Source ${fromKey} is missing while destination ${toKey} exists.`)], transactionId: null };
      return { status: 'ok', rekeyed: false, registered: false, actions: [action('unchanged', 'rekey brain project', `No registry entry for ${fromKey}`)], transactionId: null };
    }
    if (destination) return { status: 'partial', rekeyed: false, actions: [action('conflict', 'rekey brain project', `Destination ${toKey} already exists.`)], transactionId: null };
    const project = { ...source, key: toKey };
    if (!execute) return { status: 'ok', rekeyed: false, project, actions: [action('planned', 'rekey brain project', `${fromKey} → ${toKey}`)], transactionId: null };
    const projects = registry.projects.map((entry) => entry === source ? project : entry);
    validateRegistry({ ...registry, projects });
    const transaction = await beginTransaction(home, 'brain-registry');
    try {
      await writeTracked(transaction, brainRegistryPath(home), `${JSON.stringify({ ...registry, projects }, null, 2)}\n`);
      const receipt = await finishTransaction(transaction);
      return { status: 'ok', rekeyed: true, project, actions: [action('changed', 'rekey brain project', `${fromKey} → ${toKey}`)], transactionId: receipt.id };
    } catch (error) { await finishTransaction(transaction, 'failed'); throw error; }
  };
  return execute ? withLock(home, apply) : apply();
}

export async function brainProjects({ home }) {
  const registry = await loadBrainRegistry({ home });
  const projects = await Promise.all(registry.projects.map(async (entry) => {
    const diagnostics = [];
    for (const root of entry.roots) {
      try { await lstat(root); } catch (error) { if (error.code === 'ENOENT') diagnostics.push(`unavailable root: ${root}`); else throw error; }
    }
    return { ...publicEntry(entry), diagnostics };
  }));
  return { status: 'ok', schemaVersion: registry.schemaVersion, defaultScope: registry.defaultScope, projects, actions: [action('unchanged', 'list brain projects', `${projects.length} registered`)] };
}
