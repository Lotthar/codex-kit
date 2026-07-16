import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  brainAudit,
  brainConfigPath,
  brainConfigure,
  brainInit,
  brainRecall,
  brainRemember,
  brainStatus,
  deriveProjectKey,
  projectKey,
} from '../src/obsidian.mjs';

const PROJECT = 'codex-kit-1234567890';
const HOME = `Projects/${PROJECT}/Home.md`;

async function configuredHome() {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-brain-'));
  await brainConfigure({ home, vault: 'Codex Brain', execute: true });
  return home;
}

function fakeObsidian(initial = {}) {
  const notes = new Map(Object.entries(initial));
  const calls = [];
  let online = true;
  const runner = async (command, args) => {
    calls.push({ command, args });
    if (!online) return { status: 1, stderr: 'CLI unavailable' };
    assert.equal(command, 'obsidian');
    const commandArgs = args[0]?.startsWith('vault=') ? args.slice(1) : args;
    if (args[0]?.startsWith('vault=') && args[0] !== 'vault=Codex Brain') return { status: 1, stderr: 'Unknown vault' };
    const operation = commandArgs[0];
    const param = (name) => commandArgs.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
    if (operation === 'version') return { status: 0, stdout: '1.12.7\n' };
    if (operation === 'vault') return { status: 0, stdout: 'Codex Brain\n' };
    if (operation === 'read') return notes.has(param('path')) ? { status: 0, stdout: notes.get(param('path')) } : { status: 1, stderr: 'File not found' };
    if (operation === 'create') {
      const path = param('path');
      if (notes.has(path)) return { status: 1, stderr: 'File already exists' };
      notes.set(path, param('content'));
      return { status: 0, stdout: path };
    }
    if (operation === 'search') {
      const query = param('query').toLowerCase();
      const scope = param('path');
      const matches = [...notes].filter(([path, content]) => path.startsWith(`${scope}/`) && content.toLowerCase().includes(query)).map(([path]) => ({ path }));
      return { status: 0, stdout: JSON.stringify(matches) };
    }
    if (operation === 'files') {
      const scope = param('folder');
      return { status: 0, stdout: [...notes.keys()].filter((path) => path.startsWith(`${scope}/`) && path.endsWith('.md')).join('\n') };
    }
    return { status: 1, stderr: `Unsupported fake command: ${operation}` };
  };
  return { calls, notes, runner, setOnline(value) { online = value; } };
}

const gitRunner = (commit = 'a'.repeat(40)) => async (command, args) => {
  assert.equal(command, 'git');
  if (args.includes('rev-parse')) return { status: 0, stdout: `${commit}\n` };
  return { status: 1, stderr: 'not used' };
};

function memory({ project = PROJECT, kind = 'decision', key = 'decision-1234567890abcdef', commit = 'a'.repeat(40), sources = ['commit:abc'], supersedes = '', body = 'needle durable evidence' } = {}) {
  return `---\ncodex_brain: true\nproject: "${project}"\nkind: "${kind}"\nkey: "${key}"\nstatus: "active"\ncreated: "2026-07-16T00:00:00.000Z"\nverified_commit: "${commit}"\nsources: ${JSON.stringify(sources)}\nsupersedes: "${supersedes}"\nauthor: "codex"\n---\n\n# Memory\n\n${body}\n`;
}

test('configures only a vault name and rejects paths and symlink escapes', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-brain-config-'));
  const preview = await brainConfigure({ home, vault: 'Codex Brain' });
  assert.equal(preview.actions[0].state, 'planned');
  assert.equal((await import('node:fs')).existsSync(brainConfigPath(home)), false);
  await brainConfigure({ home, vault: 'Codex Brain', execute: true });
  assert.deepEqual(JSON.parse(await readFile(brainConfigPath(home), 'utf8')), { vault: 'Codex Brain' });
  await assert.rejects(() => brainConfigure({ home, vault: '/home/me/Brain', execute: true }), /vault name/i);

  const escapedHome = await mkdtemp(join(tmpdir(), 'codex-kit-brain-link-'));
  const outside = await mkdtemp(join(tmpdir(), 'codex-kit-brain-outside-'));
  await symlink(outside, join(escapedHome, '.codex-kit'));
  await assert.rejects(() => brainConfigure({ home: escapedHome, vault: 'Brain', execute: true }), /Symlink escapes/);
});

test('derives portable project keys from normalized Git identity and root commit', async () => {
  const remote = (value) => async (_command, args) => args.includes('get-url') ? { status: 0, stdout: value } : { status: 1 };
  const first = await deriveProjectKey({ root: '/tmp/clone-one', runner: remote('git@GitHub.com:Lotthar/codex-kit.git\n') });
  const second = await projectKey({ root: '/var/tmp/renamed-clone', runner: remote('https://user:token@github.com/Lotthar/codex-kit.git') });
  const digest = createHash('sha256').update('github.com/lotthar/codex-kit').digest('hex').slice(0, 10);
  assert.equal(first, `codex-kit-${digest}`);
  assert.equal(second, first);
  assert.equal(await projectKey({ root: '/tmp/ignored', existingKey: PROJECT, runner: () => assert.fail('runner should not be called') }), PROJECT);

  const rootCommit = async (_command, args) => args.includes('get-url') ? { status: 1 } : { status: 0, stdout: `${'b'.repeat(40)}\n` };
  assert.equal(await deriveProjectKey({ root: '/tmp/a', runner: rootCommit }), await deriveProjectKey({ root: '/different/name', runner: rootCommit }));
  const localRemote = async (_command, args) => args.includes('get-url') ? { status: 0, stdout: '/private/checkout/repo.git\n' } : { status: 0, stdout: `${'b'.repeat(40)}\n` };
  assert.equal(await deriveProjectKey({ root: '/tmp/a', runner: localRemote }), await deriveProjectKey({ root: '/different/name', runner: rootCommit }));

  const uncommitted = async () => ({ status: 1, stderr: 'not initialized' });
  const unrelatedOne = await deriveProjectKey({ root: '/tmp/one/same-name', runner: uncommitted, seedFactory: () => '11111111-1111-4111-8111-111111111111' });
  const unrelatedTwo = await deriveProjectKey({ root: '/tmp/two/same-name', runner: uncommitted, seedFactory: () => '22222222-2222-4222-8222-222222222222' });
  assert.match(unrelatedOne, /^same-name-[a-f0-9]{10}$/);
  assert.notEqual(unrelatedOne, unrelatedTwo);
  assert.equal(await deriveProjectKey({ root: '/tmp/ignored', existing: unrelatedOne, runner: () => assert.fail('runner should not be called'), seedFactory: () => assert.fail('seed should not be called') }), unrelatedOne);
});

test('initializes through argument-array CLI calls and is idempotent', async () => {
  const home = await configuredHome();
  const fake = fakeObsidian();
  const preview = await brainInit({ home, projectKey: PROJECT, runner: fake.runner });
  assert.equal(preview.initialized, false);
  assert.equal(fake.notes.size, 0);
  const applied = await brainInit({ home, projectKey: PROJECT, runner: fake.runner, execute: true, clock: () => new Date('2026-07-16T00:00:00.000Z') });
  assert.equal(applied.initialized, true);
  assert.match(fake.notes.get(HOME), /author: "human"/);
  assert.equal((await brainInit({ home, projectKey: PROJECT, runner: fake.runner, execute: true })).actions[0].state, 'unchanged');
  assert.equal(fake.calls.every((item) => item.command === 'obsidian' && Array.isArray(item.args)), true);
  assert.equal(fake.calls.filter((item) => item.args.includes('create')).every((item) => item.args[0] === 'vault=Codex Brain'), true);
});

test('treats official CLI Error output as failure even when the process exits zero', async () => {
  const home = await configuredHome();
  const notes = new Map();
  const runner = async (_command, args) => {
    if (args[0] === 'version') return { status: 0, stdout: 'Warning: Electron 39.0.0 startup was slow\n1.12.7 (installer 1.12.7)\n' };
    const operation = args[1];
    if (operation === 'vault') return { status: 0, stdout: 'Codex Brain\n' };
    if (operation === 'read') return { status: 0, stdout: `Warning: cache is cold\nError: File "${HOME}" not found.\n` };
    if (operation === 'create') {
      notes.set(args.find((item) => item.startsWith('path='))?.slice(5), args.find((item) => item.startsWith('content='))?.slice(8));
      return { status: 0, stdout: 'Created\n' };
    }
    return { status: 1, stderr: 'unexpected' };
  };
  const result = await brainInit({ home, projectKey: PROJECT, runner, execute: true });
  assert.equal(result.initialized, true);
  assert.equal(notes.has(HOME), true);
});

test('requires official Obsidian CLI 1.12.7 before every vault operation', async () => {
  const home = await configuredHome();
  const calls = [];
  const runner = async (_command, args) => { calls.push(args); return { status: 0, stdout: 'Obsidian 1.12.6\n' }; };
  const options = { home, projectKey: PROJECT, runner };
  const results = [
    await brainInit(options),
    await brainStatus(options),
    await brainRecall({ ...options, query: 'context' }),
    await brainRemember({ ...options, kind: 'lesson', title: 'Title', summary: 'Summary', execute: true }),
    await brainAudit(options),
  ];
  assert.equal(calls.length, results.length);
  assert.equal(calls.every((args) => args.length === 1 && args[0] === 'version'), true);
  for (const result of results) {
    assert.equal(result.status, 'partial');
    assert.match(JSON.stringify(result.actions), /1\.12\.7/);
  }
});

test('rejects application Error output from version even after warnings', async () => {
  const home = await configuredHome();
  const calls = [];
  const runner = async (_command, args) => {
    calls.push(args);
    return { status: 0, stdout: 'Warning: startup took longer than expected\nApplication Error: Obsidian is not ready\nObsidian 1.12.7\n' };
  };
  const result = await brainInit({ home, projectKey: PROJECT, runner });
  assert.equal(result.status, 'partial');
  assert.equal(calls.length, 1);
  assert.match(JSON.stringify(result.actions), /Application Error/);
});

test('reports missing configuration and CLI failures without exposing note bodies', async () => {
  const empty = await mkdtemp(join(tmpdir(), 'codex-kit-brain-status-'));
  assert.equal((await brainStatus({ home: empty, projectKey: PROJECT })).configured, false);
  const home = await configuredHome();
  const fake = fakeObsidian({ [HOME]: 'do-not-return-this-body' });
  fake.setOnline(false);
  assert.equal((await brainStatus({ home, projectKey: PROJECT, runner: fake.runner })).cli, false);
  fake.setOnline(true);
  const status = await brainStatus({ home, projectKey: PROJECT, runner: fake.runner });
  assert.equal(status.initialized, true);
  assert.doesNotMatch(JSON.stringify(status), /do-not-return-this-body/);
  assert.doesNotMatch(JSON.stringify(status), /Codex Brain/);
});

test('missing machine configuration is actionable partial for every brain operation', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-brain-unconfigured-'));
  const options = { home, projectKey: PROJECT };
  const results = [
    await brainInit(options),
    await brainStatus(options),
    await brainRecall({ ...options, query: 'context' }),
    await brainRemember({ ...options, kind: 'lesson', title: 'Title', summary: 'Summary' }),
    await brainAudit(options),
  ];
  for (const result of results) {
    assert.equal(result.status, 'partial');
    assert.match(JSON.stringify(result.actions), /brain configure/);
  }
});

test('writes append-only memories with flat metadata and body-free receipts', async () => {
  const home = await configuredHome();
  const fake = fakeObsidian({ [HOME]: '# Home' });
  const options = {
    home,
    root: '/repo',
    projectKey: PROJECT,
    kind: 'decision',
    title: 'Use SQLite',
    summary: 'SQLite keeps the local system simple.',
    details: 'Revisit if write contention is measured.',
    source: ['commit:abc', 'test:storage'],
    supersedes: '',
    runner: fake.runner,
    gitRunner: gitRunner(),
    clock: () => new Date('2026-07-16T12:34:56.000Z'),
    idFactory: () => '12345678-1234-1234-1234-123456789abc',
  };
  const preview = await brainRemember(options);
  assert.equal(preview.remembered, false);
  assert.equal('path' in preview, false);
  assert.equal('key' in preview, false);
  assert.match(preview.destinationPattern, /YYYY-MM-DD-use-sqlite-<uuid>\.md$/);
  assert.match(preview.actions[0].detail, /^destination pattern:/);
  assert.deepEqual(preview.proposedMetadata.sources, ['commit:abc', 'test:storage']);
  assert.equal(preview.proposedMetadata.supersedes, '');
  assert.equal(preview.proposedMetadata.status, 'active');
  assert.equal(preview.proposedMetadata.author, 'codex');
  assert.equal(preview.proposedMetadata.verified_commit, 'current Git HEAD at apply, when available');
  assert.equal(fake.notes.size, 1);
  const receipt = await brainRemember({ ...options, execute: true });
  assert.equal(receipt.remembered, true);
  assert.doesNotMatch(JSON.stringify(receipt), /SQLite keeps/);
  const content = fake.notes.get(receipt.path);
  assert.match(content, /codex_brain: true/);
  assert.match(content, /kind: "decision"/);
  assert.match(content, /verified_commit: "aaaaaaaa/);
  assert.match(content, /sources: \["commit:abc","test:storage"\]/);
  assert.equal(receipt.path.startsWith(`Projects/${PROJECT}/Decisions/`), true);
  assert.equal(receipt.path.endsWith('-12345678-1234-1234-1234-123456789abc.md'), true);
});

test('rejects secrets, oversized payloads, and unsafe supersedes before CLI mutation', async () => {
  const home = await configuredHome();
  const fake = fakeObsidian();
  const base = { home, projectKey: PROJECT, kind: 'lesson', title: 'Safe title', summary: 'Safe summary', runner: fake.runner, idFactory: () => '12345678-1234-1234-1234-123456789abc' };
  await assert.rejects(() => brainRemember({ ...base, summary: `credential sk-${'a'.repeat(24)}`, execute: true }), /secret/i);
  await assert.rejects(() => brainRemember({ ...base, details: 'x'.repeat(25 * 1024), execute: true }), /exceeds/i);
  await assert.rejects(() => brainRemember({ ...base, supersedes: '../../Other.md', execute: true }), /supersedes/i);
  assert.equal(fake.calls.length, 0);
});

test('recall is project-scoped by default, explicitly cross-project, and byte bounded', async () => {
  const home = await configuredHome();
  const notes = { [HOME]: `# Home\n\nneedle ${'🙂'.repeat(900)}` };
  for (let index = 0; index < 8; index += 1) notes[`Projects/${PROJECT}/Lessons/note-${index}.md`] = memory({ key: `lesson-1234567890abcde${index}`, body: `needle ${'🙂'.repeat(900)} ${index}` });
  notes['Projects/other-project-1234567890/Lessons/other.md'] = memory({ project: 'other-project-1234567890', key: 'lesson-fedcba0987654321', body: 'needle cross-project marker' });
  const fake = fakeObsidian(notes);
  const local = await brainRecall({ home, root: '/repo', projectKey: PROJECT, query: 'needle', runner: fake.runner, gitRunner: gitRunner() });
  assert.equal(local.notes.length, 5);
  assert.equal(local.bytes <= 8 * 1024, true);
  assert.doesNotMatch(local.context, /cross-project marker/);
  assert.doesNotMatch(local.context, /�/);
  const cross = await brainRecall({ home, root: '/repo', projectKey: PROJECT, query: 'cross-project marker', crossProject: true, runner: fake.runner, gitRunner: gitRunner() });
  assert.match(cross.context, /cross-project marker/);
  assert.equal(cross.notes[0].project, 'other-project-1234567890');
});

test('recall ignores unsafe search paths returned by the CLI', async () => {
  const home = await configuredHome();
  const base = fakeObsidian({ [HOME]: '# Home needle' });
  const runner = async (command, args, options) => {
    if (args.includes('search')) return { status: 0, stdout: JSON.stringify([{ path: '../Secrets.md' }, { path: `Projects/${PROJECT}/../Secrets.md` }]) };
    return base.runner(command, args, options);
  };
  const result = await brainRecall({ home, projectKey: PROJECT, query: 'needle', runner });
  assert.equal(result.notes.length, 0);
  assert.equal(base.calls.some((item) => item.args.some((arg) => arg.includes('Secrets.md'))), false);
});

test('audit returns metadata-only stale, source, supersedes, and secret findings', async () => {
  const home = await configuredHome();
  const first = `Projects/${PROJECT}/Decisions/first.md`;
  const second = `Projects/${PROJECT}/Decisions/second.md`;
  const fake = fakeObsidian({
    [HOME]: '# Home',
    [first]: memory({ key: 'decision-1111111111111111', commit: 'b'.repeat(40), sources: [], body: `private ${'AKIA1234567890ABCDEF'}` }),
    [second]: memory({ key: 'decision-2222222222222222', supersedes: 'decision-missing0000000' }),
  });
  const result = await brainAudit({ home, root: '/repo', projectKey: PROJECT, runner: fake.runner, gitRunner: gitRunner() });
  assert.equal(result.status, 'partial');
  assert.equal(result.stale, 1);
  assert.deepEqual(new Set(result.findings.map((item) => item.code)), new Set(['possible-secret', 'unsourced', 'stale', 'dangling-supersedes']));
  assert.doesNotMatch(JSON.stringify(result), /AKIA1234567890ABCDEF/);
  assert.doesNotMatch(JSON.stringify(result), /private /);
});

test('missing vault is a partial state for initialization', async () => {
  const home = await configuredHome();
  const runner = async (_command, args) => args.includes('version') ? { status: 0, stdout: '1.12.7' } : { status: 1, stderr: 'Cannot open Codex Brain' };
  const result = await brainInit({ home, projectKey: PROJECT, runner, execute: true });
  assert.equal(result.status, 'partial');
  assert.equal(result.initialized, false);
  assert.doesNotMatch(JSON.stringify(result), /Codex Brain/);
});
