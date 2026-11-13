import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { runtimeSkillInventory, searchSkills } from '../src/skill-discovery.mjs';

function fakeAppServer(reply) {
  return () => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
      kill() { return true; }
    });
    child.stdin.on('data', (chunk) => reply(JSON.parse(chunk.toString()), child));
    return child;
  };
}

async function skill(root, name, description, { implicit = true, enabled = true } = {}) {
  const directory = join(root, name);
  await mkdir(join(directory, 'agents'), { recursive: true });
  if (!implicit) await writeFile(join(directory, 'agents', 'openai.yaml'), 'policy:\n  allow_implicit_invocation: false\n');
  return { name, description, path: join(directory, 'SKILL.md'), scope: 'user', enabled };
}

test('runtime inventory completes the native app-server handshake', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-skill-discovery-'));
  const calls = [];
  const result = await runtimeSkillInventory({ root, timeoutMs: 100, spawnProcess: fakeAppServer((message, child) => {
    calls.push(message);
    if (message.id === 1) child.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }) + '\n');
    if (message.id === 2) child.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { marketplaceLoadErrors: [{ message: 'offline marketplace' }] } }) + '\n');
    if (message.id === 3) child.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 3, result: { data: [{ cwd: root, skills: [], errors: [{ message: 'bad skill' }] }] } }) + '\n');
  }) });
  assert.deepEqual(result, { cwd: root, skills: [], errors: [{ message: 'offline marketplace' }, { message: 'bad skill' }] });
  assert.deepEqual(calls.map((call) => call.method), ['initialize', 'initialized', 'plugin/installed', 'skills/list']);
  assert.deepEqual(calls.at(-2).params, { cwds: [root] });
  assert.deepEqual(calls.at(-1).params, { cwds: [root], forceReload: true });
});

test('runtime inventory rejects protocol errors, malformed replies, and timeouts', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-skill-discovery-errors-'));
  await t.test('protocol error', async () => {
    await assert.rejects(runtimeSkillInventory({ root, spawnProcess: fakeAppServer((message, child) => {
      if (message.id === 1) child.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -1 } }) + '\n');
    }) }), /request failed/);
  });
  await t.test('malformed reply', async () => {
    await assert.rejects(runtimeSkillInventory({ root, spawnProcess: fakeAppServer((message, child) => {
      if (message.id === 1) child.stdout.write('{not json}\n');
    }) }), /invalid JSON/);
  });
  await t.test('timeout', async () => {
    await assert.rejects(runtimeSkillInventory({ root, timeoutMs: 5, spawnProcess: fakeAppServer(() => {}) }), /timed out/);
  });
});

test('search keeps direct explicit calls while automatic search omits them and disabled skills', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-skill-search-'));
  const automatic = await skill(root, 'kit-ui', 'Design accessible interface components');
  const explicit = await skill(root, 'figma-use', 'Create Figma designs safely', { implicit: false });
  const disabled = await skill(root, 'hidden-ui', 'Design interfaces', { enabled: false });
  const catalog = { skills: [explicit, disabled, automatic], errors: [] };
  const automaticResult = await searchSkills({ query: 'design interface', catalog });
  assert.deepEqual(automaticResult.skills.map((item) => item.name), ['kit-ui']);
  assert.equal(automaticResult.skills[0].implicit, true);
  const explicitResult = await searchSkills({ name: 'figma-use', catalog });
  assert.equal(explicitResult.matched, 1);
  assert.equal(explicitResult.skills[0].implicit, false);
});

test('search bounds output and preserves incomplete-inventory warnings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-skill-search-bounds-'));
  const skills = await Promise.all(Array.from({ length: 7 }, (_, index) => skill(root, `design-${index}`, `Design ${'x'.repeat(250)}`)));
  const result = await searchSkills({ query: 'design', catalog: { skills, errors: [{ message: 'missing plugin' }] } });
  assert.equal(result.status, 'partial');
  assert.equal(result.matched, 7);
  assert.equal(result.skills.length, 5);
  assert.equal(result.skills.every((item) => item.description.length === 180), true);
  assert.match(result.warning, /1 skill-loading errors/);
});

test('search rejects missing, ambiguous, and unsafe catalog input', async () => {
  await assert.rejects(searchSkills({ catalog: { skills: [], errors: [] } }), /Use one/);
  await assert.rejects(searchSkills({ query: 'ui', name: 'kit-ui', catalog: { skills: [], errors: [] } }), /Use one/);
  await assert.rejects(searchSkills({ query: 'ui', catalog: { skills: [{ name: 'unsafe', description: 'ui', path: 'relative', enabled: true }], errors: [] } }), /Invalid skill metadata/);
});

test('search does not swallow readable-metadata failures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-skill-search-metadata-error-'));
  const broken = await skill(root, 'broken-ui', 'UI guidance');
  await mkdir(join(root, 'broken-ui', 'agents', 'openai.yaml'));
  await assert.rejects(searchSkills({ query: 'ui', catalog: { skills: [broken], errors: [] } }), /EISDIR/);
});

test('runtime inventory reports local-state initialization failures without leaking diagnostics', async () => {
  await assert.rejects(runtimeSkillInventory({ spawnProcess: fakeAppServer((message, child) => {
    if (message.id !== 1) return;
    child.stderr.write('private configuration ' + 'x'.repeat(4096) + '\nError: failed to initialize sqlite state runtime under /private/codex');
    child.emit('close', 1);
  }) }), (error) => {
    assert.match(error.message, /retry this same skill search command with narrow approval/);
    assert.doesNotMatch(error.message, /private|xxxx/);
    return true;
  });
});
