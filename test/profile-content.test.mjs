import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { profileInstructions } from '../src/profiles.mjs';
import { renderManagedBlock } from '../src/managed.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const profileIds = ['generic', 'node', 'nuxt', 'angular', 'java', 'spring', 'quarkus', 'flutter'];

async function profile(id) {
  return readFile(join(root, 'profiles', id, 'AGENTS.md'), 'utf8');
}

test('profiles are substantial, bounded, and practical', async () => {
  for (const id of profileIds) {
    const content = await profile(id);
    const lines = content.trimEnd().split(/\r?\n/).length;
    assert.ok(lines >= 100, `${id} profile is too thin: ${lines} lines`);
    assert.ok(lines <= 220, `${id} profile exceeds the context budget: ${lines} lines`);
    assert.match(content, /## .*architecture/i);
    assert.match(content, /## Commands|## Validation order/);
    assert.match(content, /## Testing/);
    assert.match(content, /## Skill routing/);
    assert.match(content, /## Definition of done/);
    assert.match(content, /## Reference anchors/);
  }
});

test('generic profile owns safe one-level delegation policy', async () => {
  const content = await profile('generic');
  assert.match(content, /Do not delegate trivial fixes/);
  assert.match(content, /one level of focused subagents/);
  assert.match(content, /Never create recursive subagent trees/);
  assert.match(content, /Wait for relevant subagents/);
  assert.match(content, /main agent synthesize decisions and own the final patch/);
});

test('runtime and framework profiles describe composable deltas', async () => {
  assert.match(await profile('node'), /in addition to the generic profile/);
  assert.match(await profile('java'), /after the generic profile/);
  for (const id of ['nuxt', 'angular']) assert.match(await profile(id), /generic and Node profiles/);
  for (const id of ['spring', 'quarkus']) assert.match(await profile(id), /generic and Java profiles/);
  assert.match(await profile('flutter'), /after the generic profile/);
});

test('profile references point only to official documentation', async () => {
  const allowed = /(?:nodejs\.org|nuxt\.com|angular\.dev|oracle\.com|maven\.apache\.org|gradle\.org|spring\.io|quarkus\.io|flutter\.dev|dart\.dev|owasp\.org|git-scm\.com)/;
  for (const id of profileIds) {
    const urls = (await profile(id)).match(/https:\/\/[^\s)]+/g) ?? [];
    assert.ok(urls.length >= 2, `${id} profile needs official reference anchors`);
    for (const url of urls) assert.match(url, allowed, `${id} has a non-official reference: ${url}`);
  }
});

test('profile instructions nest cleanly under the managed profile heading', async () => {
  const [{ text }] = await profileInstructions(['angular']);
  assert.doesNotMatch(text, /^# Angular profile/m);
  assert.match(text, /^#### Discover the workspace/m);
  assert.doesNotMatch(text, /^## /m);
});

test('common composed profiles stay below the default Codex project guidance budget', async () => {
  for (const profiles of [['generic', 'node', 'angular'], ['generic', 'java', 'spring'], ['generic', 'java', 'quarkus'], ['generic', 'flutter']]) {
    const block = renderManagedBlock({ profiles, instructions: await profileInstructions(profiles) });
    assert.ok(Buffer.byteLength(block) < 32 * 1024, `${profiles.join(' + ')} exceeds 32 KiB`);
  }
});
