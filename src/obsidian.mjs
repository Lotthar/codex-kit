import { createHash, randomUUID } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { action, atomicWrite, exists, readJson, run } from './util.mjs';

const KINDS = {
  decision: 'Decisions',
  lesson: 'Lessons',
  runbook: 'Runbooks',
  question: 'Questions',
};
const PROJECT_KEY = /^[a-z0-9][a-z0-9-]{0,79}$/;
const MEMORY_KEY = /^[a-z0-9][a-z0-9-]{0,119}$/;
const MAX_QUERY_BYTES = 512;
const MAX_FIELD_BYTES = 4 * 1024;
const MAX_NOTE_BYTES = 32 * 1024;
const MAX_NOTE_CONTEXT_BYTES = 2 * 1024;
const MAX_CONTEXT_BYTES = 8 * 1024;
const MAX_SEARCH_OUTPUT_BYTES = 512 * 1024;
const MAX_AUDIT_BYTES = 2 * 1024 * 1024;
const MAX_AUDIT_FILES = 200;
const MIN_CLI_VERSION = [1, 12, 7];
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i,
  /\b(?:sk|rk|pk)_(?:live|test)_[a-z0-9]{16,}\b/i,
  /\bsk-[a-z0-9_-]{20,}\b/i,
  /\bgh[pousr]_[a-z0-9]{20,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/,
  /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*[^\s]{8,}/i,
  /\bhttps?:\/\/[^\s/@:]+:[^\s/@]+@/i,
];

export const brainConfigPath = (home) => resolve(home, '.codex-kit', 'obsidian.json');

function within(root, candidate) {
  const rel = relative(root, candidate);
  return !rel.startsWith('..') && !isAbsolute(rel);
}

async function assertSafeMachineTarget(home, target) {
  const logicalRoot = resolve(home);
  const logicalTarget = resolve(target);
  if (!within(logicalRoot, logicalTarget)) throw new Error(`Obsidian configuration escapes Codex home: ${target}`);
  const resolvedRoot = await realpath(logicalRoot).catch((error) => {
    if (error.code === 'ENOENT') return logicalRoot;
    throw error;
  });
  let current = logicalRoot;
  for (const part of relative(logicalRoot, dirname(logicalTarget)).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink() && !within(resolvedRoot, await realpath(current))) throw new Error(`Symlink escapes Codex home: ${current}`);
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
  try {
    if ((await lstat(logicalTarget)).isSymbolicLink()) throw new Error(`Refusing to replace symlinked Obsidian configuration: ${logicalTarget}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function validateVault(vault) {
  if (typeof vault !== 'string' || vault !== vault.trim() || !vault || Buffer.byteLength(vault) > 128 || /[\\/\0\r\n]/.test(vault) || ['.', '..'].includes(vault)) {
    throw new Error('Vault must be a vault name, not a path.');
  }
  return vault;
}

function validateProjectKey(projectKey) {
  if (!PROJECT_KEY.test(String(projectKey ?? ''))) throw new Error('Invalid Obsidian project key.');
  return projectKey;
}

function normalizeResult(result, command, args) {
  const stdout = String(result?.stdout ?? '');
  const stderr = String(result?.stderr ?? '');
  const applicationError = `${stdout}\n${stderr}`.split(/\r?\n/).map((line) => line.trim()).find((line) => /^(?:Application\s+)?Error(?:\s*:|\s*$)/i.test(line));
  return {
    command,
    args,
    status: applicationError ? 1 : Number.isInteger(result?.status) ? result.status : 1,
    stdout,
    stderr,
    error: result?.error ? String(result.error) : applicationError || undefined,
  };
}

async function call(runner, args, { vault, cwd, timeout = 30_000 } = {}) {
  const commandArgs = vault ? [`vault=${validateVault(vault)}`, ...args] : args;
  try { return normalizeResult(await runner('obsidian', commandArgs, { cwd, timeout }), 'obsidian', commandArgs); }
  catch (error) { return normalizeResult({ status: 1, error: error.message }, 'obsidian', commandArgs); }
}

function failureDetail(result, redact = []) {
  let detail = result.stderr.trim() || result.error || 'Obsidian CLI command failed.';
  for (const value of redact.filter(Boolean)) detail = detail.split(value).join('[configured vault]');
  return byteTruncate(detail, 512);
}

function sandboxDenied(result) {
  return /\b(?:EPERM|EACCES)\b/i.test(`${result.error}\n${result.stderr}`);
}

function parsedCliVersion(output) {
  const lines = String(output ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const preferred = lines.findLast((line) => /^Obsidian(?:\s+CLI)?(?:\s+version)?\s*:?\s*v?\d+\.\d+\.\d+/i.test(line));
  const fallback = lines.findLast((line) => /^v?\d+\.\d+\.\d+(?:[-+][0-9a-z.-]+)?(?:\s+\(installer\s+\d+\.\d+\.\d+\))?$/i.test(line));
  const match = (preferred || fallback)?.match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function atLeast(version, minimum) {
  for (let index = 0; index < minimum.length; index += 1) if (version[index] !== minimum[index]) return version[index] > minimum[index];
  return true;
}

async function supportedCli(runner) {
  const result = await call(runner, ['version']);
  if (result.status !== 0) {
    const detail = failureDetail(result);
    if (sandboxDenied(result)) return { ok: false, detail: `Obsidian CLI access was denied by the current execution environment. Retry this Codex Kit brain command with narrowly approved desktop/Obsidian CLI access. ${detail}` };
    return { ok: false, detail: `Obsidian 1.12.7+ with the official CLI enabled is required. ${detail}` };
  }
  const version = parsedCliVersion(`${result.stdout}\n${result.stderr}`);
  if (!version) return { ok: false, detail: 'Could not verify the Obsidian CLI version. Install Obsidian 1.12.7+ and enable Command line interface in Settings → General.' };
  if (!atLeast(version, MIN_CLI_VERSION)) return { ok: false, detail: `Obsidian CLI ${version.join('.')} is unsupported. Install Obsidian 1.12.7 or newer.` };
  return { ok: true, version: version.join('.') };
}

async function loadConfig(home) {
  const path = brainConfigPath(home);
  if (!exists(path)) return null;
  const config = await readJson(path);
  if (!config || Object.keys(config).length !== 1 || typeof config.vault !== 'string') throw new Error('Invalid Obsidian machine configuration; expected only a vault name.');
  return { vault: validateVault(config.vault) };
}

async function configurationState(home) {
  try {
    const config = await loadConfig(home);
    return config ? { config } : { error: 'Obsidian is not configured. Run `codex-kit brain configure --vault NAME --yes`.' };
  } catch (error) { return { error: error.message }; }
}

export async function brainConfigure({ home, vault, execute = false }) {
  validateVault(vault);
  const path = brainConfigPath(home);
  if (!execute) return { status: 'ok', configured: false, actions: [action('planned', 'configure Obsidian vault', 'selected vault')] };
  await assertSafeMachineTarget(home, path);
  await atomicWrite(path, `${JSON.stringify({ vault }, null, 2)}\n`);
  return { status: 'ok', configured: true, actions: [action('changed', 'configure Obsidian vault', 'selected vault')] };
}

function normalizeGitIdentity(value) {
  const source = String(value ?? '').trim();
  if (!source) return '';
  if (isAbsolute(source) || /^file:\/\//i.test(source) || /^[a-z]:[\\/]/i.test(source)) return '';
  const scp = source.match(/^(?:[^@/]+@)?([^:/]+):(.+)$/);
  if (scp && !/^[a-z][a-z0-9+.-]*:\/\//i.test(source)) return `${scp[1]}/${scp[2]}`.toLowerCase().replace(/\.git\/?$/, '').replace(/^\/+|\/+$/g, '');
  try {
    const parsed = new URL(source.includes('://') ? source : `https://${source}`);
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase().replace(/\.git\/?$/, '').replace(/^\/+|\/+$/g, '');
  } catch {
    return source.toLowerCase().replace(/^[^@\s]+@/, '').replace(/\.git\/?$/, '').replace(/^\/+|\/+$/g, '');
  }
}

function slug(value) {
  const normalized = String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (normalized || 'project').slice(0, 60).replace(/-+$/g, '');
}

export async function deriveProjectKey({ root, existing, runner = run, seedFactory = randomUUID, allocate = true }) {
  if (existing) return validateProjectKey(existing);
  const remoteResult = await runner('git', ['-C', root, 'remote', 'get-url', 'origin'], { timeout: 10_000 });
  let identity = remoteResult?.status === 0 ? normalizeGitIdentity(remoteResult.stdout) : '';
  let repoName = identity ? basename(identity) : 'project';
  if (!identity) {
    const firstCommit = await runner('git', ['-C', root, 'rev-list', '--max-parents=0', 'HEAD'], { timeout: 10_000 });
    const commit = firstCommit?.status === 0 ? firstCommit.stdout.trim().split(/\s+/)[0] : '';
    repoName = commit ? 'project' : basename(root);
    if (!commit && !allocate) return null;
    const seed = commit ? '' : String(seedFactory());
    if (!commit && !/^[a-f0-9-]{16,64}$/i.test(seed)) throw new Error('Project key seed generator returned an unsafe value.');
    identity = commit ? `git-root:${commit}` : `uncommitted-seed:${seed}`;
  }
  return `${slug(repoName)}-${createHash('sha256').update(identity).digest('hex').slice(0, 10)}`;
}

export async function projectKey({ root, existingKey, runner = run, seedFactory = randomUUID }) {
  return deriveProjectKey({ root, existing: existingKey, runner, seedFactory });
}

function homePath(projectKey) { return `Projects/${validateProjectKey(projectKey)}/Home.md`; }
function projectPath(projectKey) { return `Projects/${validateProjectKey(projectKey)}`; }

function yaml(value) { return JSON.stringify(String(value ?? '')); }
function metadataLines(metadata) {
  return [
    '---',
    `codex_brain: ${metadata.codex_brain === true ? 'true' : yaml(metadata.codex_brain)}`,
    `project: ${yaml(metadata.project)}`,
    `kind: ${yaml(metadata.kind)}`,
    `key: ${yaml(metadata.key)}`,
    `status: ${yaml(metadata.status)}`,
    `created: ${yaml(metadata.created)}`,
    `verified_commit: ${yaml(metadata.verified_commit)}`,
    `sources: ${JSON.stringify(metadata.sources ?? [])}`,
    `supersedes: ${yaml(metadata.supersedes)}`,
    `author: ${yaml(metadata.author)}`,
    '---',
  ];
}

function homeContent(projectKey, created) {
  return `${metadataLines({ codex_brain: true, project: projectKey, kind: 'home', key: 'home', status: 'active', created, verified_commit: '', sources: [], supersedes: '', author: 'human' }).join('\n')}\n\n# Project Brain\n\nThis is the human-maintained map for \`${projectKey}\`. Keep durable context here and link to Decisions, Lessons, Runbooks, and Questions.\n`;
}

export async function brainInit({ home, projectKey, execute = false, runner = run, clock = () => new Date() }) {
  validateProjectKey(projectKey);
  const state = await configurationState(home);
  if (!state.config) return { status: 'partial', initialized: false, projectKey, actions: [action('recommended', 'configure Obsidian vault', state.error)] };
  const config = state.config;
  const cli = await supportedCli(runner);
  if (!cli.ok) return { status: 'partial', initialized: false, projectKey, actions: [action('failed', 'use supported Obsidian CLI', cli.detail)] };
  const vault = await call(runner, ['vault', 'info=name'], { vault: config.vault });
  if (vault.status !== 0) return { status: 'partial', initialized: false, actions: [action('failed', 'connect to Obsidian vault', failureDetail(vault, [config.vault]))] };
  const path = homePath(projectKey);
  const current = await call(runner, ['read', `path=${path}`], { vault: config.vault });
  if (current.status === 0) return { status: 'ok', initialized: true, projectKey, path, actions: [action('unchanged', 'initialize Obsidian project brain', path)] };
  if (!execute) return { status: 'ok', initialized: false, projectKey, path, actions: [action('planned', 'initialize Obsidian project brain', path)] };
  const content = homeContent(projectKey, clock().toISOString());
  const created = await call(runner, ['create', `path=${path}`, `content=${content}`], { vault: config.vault });
  if (created.status !== 0) return { status: 'partial', initialized: false, projectKey, path, actions: [action('failed', 'initialize Obsidian project brain', failureDetail(created, [config.vault]))] };
  return { status: 'ok', initialized: true, projectKey, path, actions: [action('changed', 'initialize Obsidian project brain', path)] };
}

export async function brainStatus({ home, projectKey, runner = run }) {
  let config;
  try { config = await loadConfig(home); }
  catch (error) { return { status: 'partial', configured: false, cli: false, vault: false, initialized: false, actions: [action('failed', 'read Obsidian configuration', error.message)] }; }
  if (!config) return { status: 'partial', configured: false, cli: false, vault: false, initialized: false, actions: [action('recommended', 'configure Obsidian vault', 'codex-kit brain configure --vault NAME --yes')] };
  const version = await supportedCli(runner);
  if (!version.ok) return { status: 'partial', configured: true, cli: false, vault: false, initialized: false, actions: [action('failed', 'use supported Obsidian CLI', version.detail)] };
  const vault = await call(runner, ['vault', 'info=name'], { vault: config.vault });
  if (vault.status !== 0) return { status: 'partial', configured: true, cli: true, vault: false, initialized: false, actions: [action('failed', 'connect to Obsidian vault', failureDetail(vault, [config.vault]))] };
  if (!projectKey) return { status: 'ok', configured: true, cli: true, vault: true, initialized: false, actions: [action('unchanged', 'Obsidian Project Brain', 'configured')] };
  validateProjectKey(projectKey);
  const path = homePath(projectKey);
  const note = await call(runner, ['read', `path=${path}`], { vault: config.vault });
  return {
    status: note.status === 0 ? 'ok' : 'partial',
    configured: true,
    cli: true,
    vault: true,
    initialized: note.status === 0,
    projectKey,
    path,
    actions: [action(note.status === 0 ? 'unchanged' : 'recommended', 'Obsidian project brain', note.status === 0 ? path : 'run codex-kit brain init --yes')],
  };
}

function byteTruncate(value, limit) {
  let output = '';
  let bytes = 0;
  for (const character of String(value ?? '')) {
    const width = Buffer.byteLength(character);
    if (bytes + width > limit) break;
    output += character;
    bytes += width;
  }
  return output;
}

function validateText(name, value, { required = false, max = MAX_FIELD_BYTES } = {}) {
  const text = String(value ?? '').trim();
  if (required && !text) throw new Error(`${name} is required.`);
  if (Buffer.byteLength(text) > max) throw new Error(`${name} exceeds ${max} bytes.`);
  if (/\0/.test(text)) throw new Error(`${name} contains a null byte.`);
  if (secretPatterns.some((pattern) => pattern.test(text))) throw new Error(`${name} appears to contain a secret.`);
  return text;
}

function normalizeSources(source) {
  const values = (Array.isArray(source) ? source : source ? [source] : []).map((item) => validateText('source', item, { max: 1024 }));
  if (values.length > 8) throw new Error('At most 8 sources may be attached to a memory.');
  return [...new Set(values)];
}

function validateSupersedes(value, projectKey) {
  const supersedes = validateText('supersedes', value, { max: 512 });
  if (!supersedes) return '';
  if (MEMORY_KEY.test(supersedes)) return supersedes;
  if (!safeVaultPath(supersedes, projectPath(projectKey)) || !supersedes.endsWith('.md')) throw new Error('supersedes must be a memory key or a note path in this project.');
  return supersedes;
}

async function gitCommit(root, runner) {
  if (!root) return '';
  const result = await runner('git', ['-C', root, 'rev-parse', 'HEAD'], { timeout: 10_000 });
  return result?.status === 0 ? String(result.stdout ?? '').trim().split(/\s+/)[0] : '';
}

function noteContent(metadata, title, summary, details) {
  const body = `${metadataLines(metadata).join('\n')}\n\n# ${title}\n\n${summary}${details ? `\n\n## Details\n\n${details}` : ''}\n`;
  if (Buffer.byteLength(body) > MAX_NOTE_BYTES) throw new Error(`Memory note exceeds ${MAX_NOTE_BYTES} bytes.`);
  return body;
}

function noteSlug(title) { return slug(title).slice(0, 48) || 'memory'; }

export async function brainRemember({ home, root, projectKey, kind, title, summary, details, source, supersedes, execute = false, runner = run, gitRunner = run, clock = () => new Date(), idFactory = randomUUID }) {
  validateProjectKey(projectKey);
  if (!Object.hasOwn(KINDS, kind)) throw new Error(`kind must be one of: ${Object.keys(KINDS).join(', ')}.`);
  const safeTitle = validateText('title', title, { required: true, max: 256 });
  if (/[\r\n]/.test(safeTitle)) throw new Error('title must be a single line.');
  const safeSummary = validateText('summary', summary, { required: true });
  const safeDetails = validateText('details', details, { max: 24 * 1024 });
  const sources = normalizeSources(source);
  const safeSupersedes = validateSupersedes(supersedes, projectKey);
  const state = await configurationState(home);
  if (!state.config) return { status: 'partial', remembered: false, projectKey, kind, actions: [action('recommended', 'configure Obsidian vault', state.error)] };
  const config = state.config;
  const destinationPattern = `${projectPath(projectKey)}/${KINDS[kind]}/YYYY-MM-DD-${noteSlug(safeTitle)}-<uuid>.md`;
  const proposedMetadata = {
    project: projectKey,
    kind,
    status: 'active',
    sources,
    supersedes: safeSupersedes,
    author: 'codex',
    key: 'allocated at apply',
    created: 'allocated at apply',
    verified_commit: root ? 'current Git HEAD at apply, when available' : '',
  };
  noteContent({ codex_brain: true, ...proposedMetadata, key: `${kind}-<uuid>`, created: 'YYYY-MM-DDTHH:mm:ss.sssZ', verified_commit: 'f'.repeat(40) }, safeTitle, safeSummary, safeDetails);
  if (!execute) return { status: 'ok', remembered: false, projectKey, kind, destinationPattern, proposedMetadata, actions: [action('planned', 'remember Obsidian project memory', `destination pattern: ${destinationPattern}`)] };
  const cli = await supportedCli(runner);
  if (!cli.ok) return { status: 'partial', remembered: false, projectKey, kind, destinationPattern, actions: [action('failed', 'use supported Obsidian CLI', cli.detail)] };
  const created = clock().toISOString();
  const id = idFactory().toLowerCase();
  if (!/^[a-f0-9-]{16,64}$/.test(id)) throw new Error('Memory ID generator returned an unsafe value.');
  const key = `${kind}-${id}`;
  const path = `${projectPath(projectKey)}/${KINDS[kind]}/${created.slice(0, 10)}-${noteSlug(safeTitle)}-${id}.md`;
  const content = noteContent({
    codex_brain: true,
    project: projectKey,
    kind,
    key,
    status: 'active',
    created,
    verified_commit: await gitCommit(root, gitRunner),
    sources,
    supersedes: safeSupersedes,
    author: 'codex',
  }, safeTitle, safeSummary, safeDetails);
  const result = await call(runner, ['create', `path=${path}`, `content=${content}`], { vault: config.vault });
  if (result.status !== 0) return { status: 'partial', remembered: false, projectKey, kind, key, path, actions: [action('failed', 'remember Obsidian project memory', failureDetail(result, [config.vault]))] };
  return { status: 'ok', remembered: true, projectKey, kind, key, path, actions: [action('changed', 'remember Obsidian project memory', path)] };
}

function safeVaultPath(path, scope) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || path.includes('\\') || path.includes('\0')) return false;
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return false;
  return path === scope || path.startsWith(`${scope}/`);
}

function extractPaths(output) {
  const paths = [];
  const collect = (value) => {
    if (paths.length >= 100) return;
    if (typeof value === 'string') { if (value.endsWith('.md')) paths.push(value); return; }
    if (Array.isArray(value)) { for (const item of value) collect(item); return; }
    if (!value || typeof value !== 'object') return;
    for (const key of ['path', 'file', 'filename']) if (typeof value[key] === 'string') collect(value[key]);
    for (const [key, nested] of Object.entries(value)) {
      if (key.endsWith('.md')) collect(key);
      if (!['path', 'file', 'filename'].includes(key)) collect(nested);
    }
  };
  try { collect(JSON.parse(output)); }
  catch { for (const line of output.split(/\r?\n/)) collect(line.trim().replace(/^[-*]\s+/, '')); }
  return [...new Set(paths)];
}

function parseScalar(value) {
  const text = value.trim();
  if (text === 'true') return true;
  if (text === 'false') return false;
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith('[') && text.endsWith(']'))) {
    try { return JSON.parse(text); } catch { return text; }
  }
  return text;
}

function frontmatter(content) {
  const text = byteTruncate(content, 16 * 1024).replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return {};
  const end = text.indexOf('\n---', 4);
  if (end < 0 || end > 16 * 1024) return {};
  const metadata = {};
  for (const line of text.slice(4, end).split('\n')) {
    const match = line.match(/^([a-z_]+):\s*(.*)$/);
    if (match) metadata[match[1]] = parseScalar(match[2]);
  }
  return metadata;
}

function noteLabel(path, metadata, currentCommit) {
  const stale = Boolean(metadata.verified_commit && currentCommit && metadata.verified_commit !== currentCommit);
  const sources = Array.isArray(metadata.sources) ? metadata.sources : [];
  return {
    stale,
    sources,
    text: `[OBSIDIAN MEMORY | project=${metadata.project || 'unknown'} | kind=${metadata.kind || 'unknown'} | evidence=${sources.length ? 'source-backed' : 'unsourced'} | stale=${stale ? 'yes' : 'no'}${metadata.supersedes ? ` | supersedes=${metadata.supersedes}` : ''} | UNTRUSTED UNTIL VERIFIED]\npath: ${path}\n`,
  };
}

export async function brainRecall({ home, root, projectKey, query, crossProject = false, runner = run, gitRunner = run }) {
  validateProjectKey(projectKey);
  const safeQuery = validateText('query', query, { required: true, max: MAX_QUERY_BYTES });
  const state = await configurationState(home);
  if (!state.config) return { status: 'partial', projectKey, crossProject, context: '', notes: [], bytes: 0, actions: [action('recommended', 'configure Obsidian vault', state.error)] };
  const config = state.config;
  const cli = await supportedCli(runner);
  if (!cli.ok) return { status: 'partial', projectKey, crossProject, context: '', notes: [], bytes: 0, actions: [action('failed', 'use supported Obsidian CLI', cli.detail)] };
  const scope = crossProject ? 'Projects' : projectPath(projectKey);
  const actions = [];
  const blocks = [];
  const notes = [];
  const homeResult = await call(runner, ['read', `path=${homePath(projectKey)}`], { vault: config.vault });
  if (homeResult.status === 0) {
    const body = byteTruncate(homeResult.stdout, MAX_NOTE_CONTEXT_BYTES);
    blocks.push(`[PROJECT HOME | HUMAN-MAINTAINED | UNTRUSTED UNTIL VERIFIED]\npath: ${homePath(projectKey)}\n${body}`);
  } else actions.push(action('recommended', 'initialize Obsidian project brain', 'codex-kit brain init --yes'));
  const search = await call(runner, ['search', `query=${safeQuery}`, `path=${scope}`, 'limit=20', 'format=json'], { vault: config.vault });
  if (search.status !== 0) actions.push(action('failed', 'search Obsidian project brain', failureDetail(search, [config.vault])));
  else if (Buffer.byteLength(search.stdout) > MAX_SEARCH_OUTPUT_BYTES) actions.push(action('failed', 'search Obsidian project brain', 'Search output exceeded the safety cap.'));
  else {
    const currentCommit = await gitCommit(root, gitRunner);
    const paths = extractPaths(search.stdout).filter((path) => path !== homePath(projectKey) && safeVaultPath(path, scope)).slice(0, 5);
    for (const path of paths) {
      const read = await call(runner, ['read', `path=${path}`], { vault: config.vault });
      if (read.status !== 0) { actions.push(action('failed', 'read Obsidian memory', path)); continue; }
      const body = byteTruncate(read.stdout, MAX_NOTE_CONTEXT_BYTES);
      const metadata = frontmatter(body);
      const label = noteLabel(path, metadata, currentCommit);
      blocks.push(`${label.text}${body}`);
      notes.push({ path, project: metadata.project || null, kind: metadata.kind || null, key: metadata.key || null, stale: label.stale, sources: label.sources, supersedes: metadata.supersedes || null });
    }
  }
  const context = byteTruncate(blocks.join('\n\n'), MAX_CONTEXT_BYTES);
  if (!actions.length) actions.push(action('unchanged', 'recall Obsidian project brain', `${notes.length} memories`));
  return { status: actions.some((item) => item.state === 'failed') ? 'partial' : 'ok', projectKey, crossProject, context, notes, bytes: Buffer.byteLength(context), actions };
}

function fileList(output) {
  return [...new Set(output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.endsWith('.md')))];
}

function finding(path, code, message, severity = 'warning') { return { path, code, severity, message }; }

export async function brainAudit({ home, root, projectKey, crossProject = false, runner = run, gitRunner = run }) {
  validateProjectKey(projectKey);
  const state = await configurationState(home);
  if (!state.config) return { status: 'partial', projectKey, checked: 0, stale: 0, findings: [], actions: [action('recommended', 'configure Obsidian vault', state.error)] };
  const config = state.config;
  const cli = await supportedCli(runner);
  if (!cli.ok) return { status: 'partial', projectKey, checked: 0, stale: 0, findings: [], actions: [action('failed', 'use supported Obsidian CLI', cli.detail)] };
  const scope = crossProject ? 'Projects' : projectPath(projectKey);
  const listed = await call(runner, ['files', `folder=${scope}`, 'ext=md'], { vault: config.vault });
  if (listed.status !== 0) return { status: 'partial', projectKey, checked: 0, findings: [], actions: [action('failed', 'audit Obsidian project brain', failureDetail(listed, [config.vault]))] };
  if (Buffer.byteLength(listed.stdout) > MAX_SEARCH_OUTPUT_BYTES) return { status: 'partial', projectKey, checked: 0, findings: [finding(scope, 'file-list-too-large', 'File listing exceeded the safety cap.', 'error')], actions: [action('failed', 'audit Obsidian project brain', 'File listing exceeded the safety cap.')] };
  const allPaths = fileList(listed.stdout);
  const paths = allPaths.filter((path) => safeVaultPath(path, scope)).slice(0, MAX_AUDIT_FILES);
  const findings = [];
  if (paths.length < allPaths.length) findings.push(finding(scope, 'audit-truncated', `Audit inspected at most ${MAX_AUDIT_FILES} safe note paths.`));
  const keys = new Map();
  const supersedes = [];
  const currentCommit = crossProject ? '' : await gitCommit(root, gitRunner);
  let bytes = 0;
  let stale = 0;
  for (const path of paths) {
    const read = await call(runner, ['read', `path=${path}`], { vault: config.vault });
    if (read.status !== 0) { findings.push(finding(path, 'unreadable', 'Obsidian could not read this note.', 'error')); continue; }
    bytes += Buffer.byteLength(read.stdout);
    if (bytes > MAX_AUDIT_BYTES) { findings.push(finding(scope, 'audit-byte-cap', 'Audit stopped at its total read safety cap.')); break; }
    if (Buffer.byteLength(read.stdout) > MAX_NOTE_BYTES) findings.push(finding(path, 'oversized', `Note exceeds ${MAX_NOTE_BYTES} bytes.`));
    if (secretPatterns.some((pattern) => pattern.test(read.stdout))) findings.push(finding(path, 'possible-secret', 'Note may contain a secret; review and remove it.', 'error'));
    const metadata = frontmatter(byteTruncate(read.stdout, MAX_NOTE_BYTES));
    if (basename(path) === 'Home.md') continue;
    if (metadata.codex_brain !== true) findings.push(finding(path, 'missing-marker', 'codex_brain must be true.'));
    const pathProject = path.split('/')[1];
    if (metadata.project !== pathProject) findings.push(finding(path, 'project-mismatch', 'Frontmatter project does not match the note path.'));
    if (!Object.hasOwn(KINDS, metadata.kind)) findings.push(finding(path, 'invalid-kind', 'Frontmatter kind is not supported.'));
    if (!MEMORY_KEY.test(String(metadata.key ?? ''))) findings.push(finding(path, 'invalid-key', 'Frontmatter key is missing or invalid.'));
    else if (keys.has(metadata.key)) findings.push(finding(path, 'duplicate-key', `Memory key duplicates ${keys.get(metadata.key)}.`, 'error'));
    else keys.set(metadata.key, path);
    if (metadata.status !== 'active') findings.push(finding(path, 'invalid-status', 'Append-only memories must have active status.'));
    if (!Array.isArray(metadata.sources) || !metadata.sources.length) findings.push(finding(path, 'unsourced', 'Memory has no evidence source.'));
    if (metadata.verified_commit && currentCommit && metadata.verified_commit !== currentCommit) { stale += 1; findings.push(finding(path, 'stale', 'Memory was verified against a different commit.', 'info')); }
    if (metadata.supersedes) supersedes.push({ path, target: metadata.supersedes });
  }
  for (const item of supersedes) {
    const targetExists = keys.has(item.target) || (safeVaultPath(item.target, scope) && paths.includes(item.target));
    if (!targetExists) findings.push(finding(item.path, 'dangling-supersedes', 'Superseded memory was not found in the audited scope.'));
  }
  const errorCount = findings.filter((item) => item.severity === 'error').length;
  return {
    status: errorCount ? 'partial' : 'ok',
    projectKey,
    crossProject,
    checked: paths.length,
    stale,
    findings,
    actions: [action(errorCount ? 'failed' : findings.length ? 'recommended' : 'unchanged', 'audit Obsidian project brain', `${paths.length} notes; ${findings.length} findings`)],
  };
}

function migrationReceipt({ status, fromProjectKey, toProjectKey, entries = [], actions, migrated = false }) {
  return {
    status,
    migrated,
    fromProjectKey,
    toProjectKey,
    noteCount: entries.length,
    notes: entries.map(({ source, destination }) => ({ from: source, to: destination })),
    actions,
  };
}

async function brainMigrationPlan({ home, fromProjectKey, toProjectKey, runner }) {
  validateProjectKey(fromProjectKey);
  validateProjectKey(toProjectKey);
  if (fromProjectKey === toProjectKey) throw new Error('The source and destination Obsidian project keys must differ.');
  const state = await configurationState(home);
  if (!state.config) return migrationReceipt({ status: 'partial', fromProjectKey, toProjectKey, actions: [action('recommended', 'configure Obsidian vault', state.error)] });
  const cli = await supportedCli(runner);
  if (!cli.ok) return migrationReceipt({ status: 'partial', fromProjectKey, toProjectKey, actions: [action('failed', 'use supported Obsidian CLI', cli.detail)] });
  const sourceScope = projectPath(fromProjectKey);
  const targetScope = projectPath(toProjectKey);
  const [sourceFiles, targetFiles] = await Promise.all([
    call(runner, ['files', `folder=${sourceScope}`, 'ext=md'], { vault: state.config.vault }),
    call(runner, ['files', `folder=${targetScope}`, 'ext=md'], { vault: state.config.vault }),
  ]);
  if (sourceFiles.status !== 0) return migrationReceipt({ status: 'partial', fromProjectKey, toProjectKey, actions: [action('failed', 'list source Obsidian project brain', failureDetail(sourceFiles, [state.config.vault]))] });
  if (targetFiles.status !== 0) return migrationReceipt({ status: 'partial', fromProjectKey, toProjectKey, actions: [action('failed', 'list destination Obsidian project brain', failureDetail(targetFiles, [state.config.vault]))] });
  const sourcePaths = fileList(sourceFiles.stdout).filter((path) => safeVaultPath(path, sourceScope));
  const existingTargets = fileList(targetFiles.stdout).filter((path) => safeVaultPath(path, targetScope));
  if (!sourcePaths.includes(homePath(fromProjectKey))) return migrationReceipt({ status: 'partial', fromProjectKey, toProjectKey, actions: [action('failed', 'migrate Obsidian project brain', 'The source project home note is missing.')] });
  if (sourcePaths.length > MAX_AUDIT_FILES || Buffer.byteLength(sourceFiles.stdout) > MAX_SEARCH_OUTPUT_BYTES) return migrationReceipt({ status: 'partial', fromProjectKey, toProjectKey, actions: [action('failed', 'migrate Obsidian project brain', 'The source project exceeds the safe migration size limit.')] });
  if (existingTargets.length) return migrationReceipt({ status: 'partial', fromProjectKey, toProjectKey, actions: [action('failed', 'migrate Obsidian project brain', 'The destination project key already contains notes.')] });
  const entries = [];
  let bytes = 0;
  for (const source of sourcePaths) {
    const read = await call(runner, ['read', `path=${source}`], { vault: state.config.vault });
    if (read.status !== 0) return migrationReceipt({ status: 'partial', fromProjectKey, toProjectKey, entries, actions: [action('failed', 'read Obsidian project memory', source)] });
    bytes += Buffer.byteLength(read.stdout);
    if (bytes > MAX_AUDIT_BYTES || Buffer.byteLength(read.stdout) > MAX_NOTE_BYTES) return migrationReceipt({ status: 'partial', fromProjectKey, toProjectKey, entries, actions: [action('failed', 'migrate Obsidian project brain', 'A source note exceeds the safe migration size limit.')] });
    if (frontmatter(read.stdout).project !== fromProjectKey) return migrationReceipt({ status: 'partial', fromProjectKey, toProjectKey, entries, actions: [action('failed', 'migrate Obsidian project brain', `Source note has a mismatched project key: ${source}`)] });
    const destination = `${targetScope}/${relative(sourceScope, source)}`;
    if (!safeVaultPath(destination, targetScope)) throw new Error(`Unsafe Obsidian migration destination: ${destination}`);
    entries.push({ source, destination, content: read.stdout, migratedContent: read.stdout.split(fromProjectKey).join(toProjectKey) });
  }
  return { status: 'ok', fromProjectKey, toProjectKey, config: state.config, entries };
}

async function rollbackBrainMigration(entries, config, runner) {
  const failures = [];
  for (const entry of [...entries].reverse()) {
    const moved = await call(runner, ['move', `path=${entry.destination}`, `to=${dirname(entry.source)}`], { vault: config.vault });
    if (moved.status !== 0) { failures.push(entry.destination); continue; }
    const restored = await call(runner, ['create', `path=${entry.source}`, `content=${entry.content}`, 'overwrite'], { vault: config.vault });
    if (restored.status !== 0) failures.push(entry.source);
  }
  return failures;
}

async function createMigrationMarkers(entries, config, runner) {
  const markers = [...new Set(entries.map(({ destination }) => `${dirname(destination)}/codex-kit-migration-marker.md`))];
  const created = [];
  for (const marker of markers) {
    const result = await call(runner, ['create', `path=${marker}`, 'content=Temporary Codex Kit migration marker.'], { vault: config.vault });
    if (result.status === 0) { created.push(marker); continue; }
    await removeMigrationMarkers(created, config, runner);
    throw new Error(`Obsidian could not prepare ${dirname(marker)}`);
  }
  return markers;
}

async function removeMigrationMarkers(markers, config, runner) {
  const failures = [];
  for (const marker of markers) {
    const result = await call(runner, ['delete', `path=${marker}`], { vault: config.vault });
    if (result.status === 0) continue;
    const read = await call(runner, ['read', `path=${marker}`], { vault: config.vault });
    if (read.status === 0 || !/not found/i.test(`${read.stdout}\n${read.stderr}\n${read.error}`)) failures.push(marker);
  }
  return failures;
}

async function verifyBrainMigration(entries, config, fromProjectKey, toProjectKey, runner) {
  const sourceScope = projectPath(fromProjectKey);
  const targetScope = projectPath(toProjectKey);
  const [sourceFiles, targetFiles] = await Promise.all([
    call(runner, ['files', `folder=${sourceScope}`, 'ext=md'], { vault: config.vault }),
    call(runner, ['files', `folder=${targetScope}`, 'ext=md'], { vault: config.vault }),
  ]);
  if (sourceFiles.status !== 0 || targetFiles.status !== 0) return 'Obsidian could not verify the migration file lists.';
  const sources = fileList(sourceFiles.stdout).filter((path) => safeVaultPath(path, sourceScope));
  const targets = new Set(fileList(targetFiles.stdout).filter((path) => safeVaultPath(path, targetScope)));
  if (sources.length || targets.size !== entries.length) return 'The source or destination note counts do not match the migration plan.';
  for (const entry of entries) {
    if (!targets.has(entry.destination)) return `Missing migrated note: ${entry.destination}`;
    const read = await call(runner, ['read', `path=${entry.destination}`], { vault: config.vault });
    if (read.status !== 0 || frontmatter(read.stdout).project !== toProjectKey || read.stdout.includes(fromProjectKey)) return `Migrated note did not verify: ${entry.destination}`;
  }
  return '';
}

export async function brainMigrate({ home, fromProjectKey, toProjectKey, execute = false, runner = run }) {
  const plan = await brainMigrationPlan({ home, fromProjectKey, toProjectKey, runner });
  if (plan.status !== 'ok') return plan;
  if (!execute) return migrationReceipt({ status: 'ok', fromProjectKey, toProjectKey, entries: plan.entries, actions: [action('planned', 'migrate Obsidian project brain', `${plan.entries.length} notes with native Obsidian moves`)] });
  const moved = [];
  let markers = [];
  try {
    markers = await createMigrationMarkers(plan.entries, plan.config, runner);
    for (const entry of plan.entries) {
      const move = await call(runner, ['move', `path=${entry.source}`, `to=${dirname(entry.destination)}`], { vault: plan.config.vault });
      if (move.status !== 0) throw new Error(`Obsidian could not move ${entry.source}`);
      moved.push(entry);
      const update = await call(runner, ['create', `path=${entry.destination}`, `content=${entry.migratedContent}`, 'overwrite'], { vault: plan.config.vault });
      if (update.status !== 0) throw new Error(`Obsidian could not update ${entry.destination}`);
    }
    markers = await removeMigrationMarkers(markers, plan.config, runner);
    if (markers.length) throw new Error('Obsidian could not remove temporary migration markers.');
    const verification = await verifyBrainMigration(plan.entries, plan.config, fromProjectKey, toProjectKey, runner);
    if (verification) throw new Error(verification);
    return migrationReceipt({ status: 'ok', migrated: true, fromProjectKey, toProjectKey, entries: plan.entries, actions: [action('changed', 'migrate Obsidian project brain', `${plan.entries.length} notes moved and verified`)] });
  } catch (error) {
    const failures = await rollbackBrainMigration(moved, plan.config, runner);
    const markerFailures = await removeMigrationMarkers(markers, plan.config, runner);
    const rollbackFailures = failures.length + markerFailures.length;
    const rollback = rollbackFailures ? action('failed', 'rollback Obsidian project brain migration', `${rollbackFailures} temporary items require manual recovery`) : action('changed', 'rollback Obsidian project brain migration', 'source notes restored');
    return migrationReceipt({ status: 'partial', fromProjectKey, toProjectKey, entries: plan.entries, actions: [action('failed', 'migrate Obsidian project brain', byteTruncate(error.message, 512)), rollback] });
  }
}
