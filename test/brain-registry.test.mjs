import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brainProjects, brainRekey, brainRegister, brainRegistryPath, loadBrainRegistry } from '../src/brain-registry.mjs';

const home = () => mkdtemp(join(tmpdir(), 'codex-kit-registry-'));

test('loads the versioned default and writes only on execute', async () => {
  const root = await home();
  assert.deepEqual(await loadBrainRegistry({ home: root }), { schemaVersion: 1, defaultScope: 'related', projects: [] });
  const preview = await brainRegister({ home: root, name: 'Reader', root: '/work/reader' });
  assert.equal(preview.project.key, null);
  assert.equal((await import('node:fs')).existsSync(brainRegistryPath(root)), false);
  const applied = await brainRegister({ home: root, name: 'Reader', root: '/work/reader', execute: true });
  assert.match(applied.project.key, /^project-/);
  assert.equal(JSON.parse(await readFile(brainRegistryPath(root))).projects.length, 1);
});

test('validates schema, paths, symlink escape, unicode controls and secret-like input', async () => {
  const root = await home(); const outside = await home();
  await symlink(outside, join(root, '.codex-kit'));
  await assert.rejects(() => loadBrainRegistry({ home: root }), /Symlink escapes/);
  const clean = await home();
  await assert.rejects(() => brainRegister({ home: clean, key: '../bad', name: 'Name' }), /key/);
  await assert.rejects(() => brainRegister({ home: clean, key: 'good', name: 'bad\u202ename' }), /name/);
  await assert.rejects(() => brainRegister({ home: clean, key: 'good', name: 'Name', externalId: 'api_key=abcdefgh' }), /external ID/);
  await assert.rejects(() => brainRegister({ home: clean, key: 'good', name: 'Name', root: 'relative' }), /root/);
});

test('keeps stable external identity and exclusion across repeated registrations', async () => {
  const root = await home();
  const first = await brainRegister({ home: root, name: 'External', externalId: 'chatgpt:work-42', inclusion: 'excluded', execute: true });
  const repeated = await brainRegister({ home: root, externalId: 'chatgpt:work-42', execute: true });
  assert.equal(repeated.project.key, first.project.key);
  assert.equal(repeated.project.inclusion, 'excluded');
  assert.equal((await brainProjects({ home: root })).projects[0].kind, 'external');
});

test('accumulates moved worktree roots under one explicit key and preserves metadata', async () => {
  const root = await home();
  await brainRegister({ home: root, key: 'reader-123', name: 'Reader', kind: 'git', root: '/work/reader', topics: ['flutter'], execute: true });
  const moved = await brainRegister({ home: root, key: 'reader-123', root: '/work/reader-worktree', execute: true });
  assert.equal(moved.project.name, 'Reader');
  assert.deepEqual(moved.project.roots, ['/work/reader', '/work/reader-worktree']);
  assert.deepEqual(moved.project.topics, ['flutter']);
  assert.equal(moved.project.kind, 'git');
  const listed = await brainProjects({ home: root });
  assert.equal(listed.projects[0].diagnostics.length, 2);
});

test('rejects conflicting root and external mappings', async () => {
  const root = await home();
  await brainRegister({ home: root, key: 'one', name: 'One', root: '/work/one', externalId: 'external:one', execute: true });
  await brainRegister({ home: root, key: 'two', name: 'Two', root: '/work/two', execute: true });
  await assert.rejects(() => brainRegister({ home: root, key: 'two', root: '/work/one', execute: true }), /another key/);
  await assert.rejects(() => brainRegister({ home: root, key: 'two', externalId: 'external:one', execute: true }), /another key/);
});

test('rekeys an existing registry entry transactionally without changing its identity metadata', async () => {
  const root = await home();
  await brainRegister({ home: root, key: 'old-reader', name: 'Reader', kind: 'git', root: '/work/reader', externalId: 'repo:reader', topics: ['flutter'], inclusion: 'excluded', execute: true });
  const before = await readFile(brainRegistryPath(root), 'utf8');
  const preview = await brainRekey({ home: root, fromKey: 'old-reader', toKey: 'new-reader' });
  assert.equal(preview.actions[0].state, 'planned');
  assert.equal(await readFile(brainRegistryPath(root), 'utf8'), before);
  const result = await brainRekey({ home: root, fromKey: 'old-reader', toKey: 'new-reader', execute: true });
  assert.equal(result.rekeyed, true);
  assert.deepEqual(result.project, { key: 'new-reader', name: 'Reader', kind: 'git', root: '/work/reader', roots: ['/work/reader'], externalId: 'repo:reader', topics: ['flutter'], inclusion: 'excluded' });
  const conflict = await brainRekey({ home: root, fromKey: 'old-reader', toKey: 'new-reader', execute: true });
  assert.equal(conflict.status, 'partial');
  const legacy = await brainRekey({ home: root, fromKey: 'missing-reader', toKey: 'another-reader', execute: true });
  assert.equal(legacy.status, 'ok');
  assert.equal(legacy.registered, false);
});
