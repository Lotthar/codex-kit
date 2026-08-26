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

test('profiles are compact, composable, and practical', async () => {
  for (const id of profileIds) {
    const content = await profile(id);
    assert.ok(Buffer.byteLength(content) <= 4 * 1024, `${id} profile exceeds its 4 KiB context budget`);
    assert.match(content, /architecture|boundaries|build behavior/i);
    assert.match(content, /## Commands|validation/i);
    assert.match(content, /test/i);
    assert.match(content, /skill|## .*Routing/i);
    assert.match(content, /completion|Definition of done|Routing and done/i);
    assert.match(content, /## Reference anchors/);
  }
});

test('generic profile owns safe one-level delegation policy', async () => {
  const content = await profile('generic');
  assert.match(content, /Do not delegate trivial/);
  assert.match(content, /one level of focused subagents/);
  assert.match(content, /never create recursive subagent trees/i);
  assert.match(content, /Wait for relevant subagents/);
  assert.match(content, /main agent synthesizes decisions and owns the final patch/);
});

test('generic profile retains scope, safety, and validation honesty', async () => {
  const content = await profile('generic');
  assert.match(content, /system, user, root `AGENTS\.md`, then nearest path instructions/);
  assert.match(content, /unrelated user changes/);
  assert.match(content, /Never expose secrets/);
  assert.match(content, /Ask before destructive operations, migrations, deployments/);
  assert.match(content, /Do not claim a check passed without evidence/);
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

test('common composed profiles stay below the compact managed-block budget', async () => {
  for (const profiles of [['generic', 'node', 'angular'], ['generic', 'java', 'spring'], ['generic', 'java', 'quarkus'], ['generic', 'flutter']]) {
    const block = renderManagedBlock({ profiles, instructions: await profileInstructions(profiles) });
    assert.ok(Buffer.byteLength(block) <= 10 * 1024, `${profiles.join(' + ')} exceeds 10 KiB`);
  }
});

test('generic plus Node stays within the preferred common project budget', async () => {
  const block = renderManagedBlock({ profiles: ['generic', 'node'], instructions: await profileInstructions(['generic', 'node']) });
  assert.ok(Buffer.byteLength(block) <= 8 * 1024, 'generic + node exceeds 8 KiB');
});
