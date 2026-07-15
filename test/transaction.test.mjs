import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyTracked, beginTransaction, finishTransaction, removeTracked, replaceTracked, rollbackTransaction, withLock, writeTracked } from '../src/transaction.mjs';

test('tracks and restores a file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-tx-'));
  const target = join(root, 'AGENTS.md');
  await writeFile(target, 'before');
  const transaction = await beginTransaction(root, 'project');
  await writeTracked(transaction, target, 'after');
  const receipt = await finishTransaction(transaction);
  await rollbackTransaction(root, receipt.id);
  assert.equal(await readFile(target, 'utf8'), 'before');
});

test('stages a copied directory and removes it on rollback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-copy-'));
  const source = await mkdtemp(join(tmpdir(), 'codex-kit-copy-source-'));
  await writeFile(join(source, 'SKILL.md'), '# Portable');
  const destination = join(root, '.agents', 'skills', 'portable');
  const transaction = await beginTransaction(root, 'project');
  assert.equal(await copyTracked(transaction, source, destination), true);
  const receipt = await finishTransaction(transaction);
  assert.equal(await readFile(join(destination, 'SKILL.md'), 'utf8'), '# Portable');
  await rollbackTransaction(root, receipt.id);
  assert.equal((await import('node:fs')).existsSync(destination), false);
});

test('restores a tracked directory removal on rollback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-remove-'));
  const destination = join(root, '.agents', 'skills', 'portable');
  await (await import('node:fs/promises')).mkdir(destination, { recursive: true });
  await writeFile(join(destination, 'SKILL.md'), '# Portable');
  const transaction = await beginTransaction(root, 'project');
  assert.equal(await removeTracked(transaction, destination), true);
  const receipt = await finishTransaction(transaction);
  assert.equal((await import('node:fs')).existsSync(destination), false);
  await rollbackTransaction(root, receipt.id);
  assert.equal(await readFile(join(destination, 'SKILL.md'), 'utf8'), '# Portable');
});

test('replaces owned content transactionally and restores it on rollback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-replace-'));
  const source = await mkdtemp(join(tmpdir(), 'codex-kit-replace-source-'));
  const destination = join(root, '.agents', 'skills', 'portable');
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, 'SKILL.md'), '# Before');
  await writeFile(join(source, 'SKILL.md'), '# After');
  const transaction = await beginTransaction(root, 'project');
  await replaceTracked(transaction, source, destination);
  const receipt = await finishTransaction(transaction);
  assert.equal(await readFile(join(destination, 'SKILL.md'), 'utf8'), '# After');
  await rollbackTransaction(root, receipt.id);
  assert.equal(await readFile(join(destination, 'SKILL.md'), 'utf8'), '# Before');
});

test('rejects symlink parents before copying outside the project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-link-root-'));
  const outside = await mkdtemp(join(tmpdir(), 'codex-kit-link-outside-'));
  const source = await mkdtemp(join(tmpdir(), 'codex-kit-link-source-'));
  await writeFile(join(source, 'SKILL.md'), '# Portable');
  await symlink(outside, join(root, '.agents'));
  const transaction = await beginTransaction(root, 'project');
  await assert.rejects(() => copyTracked(transaction, source, join(root, '.agents', 'skills', 'portable')), /Symlink|junction/);
  assert.equal((await import('node:fs')).existsSync(join(outside, 'skills', 'portable')), false);
});

test('preflights every rollback entry before changing any target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-preflight-'));
  const first = join(root, 'first.txt');
  const second = join(root, 'second.txt');
  await writeFile(first, 'before first');
  await writeFile(second, 'before second');
  const transaction = await beginTransaction(root, 'project');
  await writeTracked(transaction, first, 'after first');
  await writeTracked(transaction, second, 'after second');
  const receipt = await finishTransaction(transaction);
  await writeFile(first, 'user change');
  await assert.rejects(() => rollbackTransaction(root, receipt.id), /user-modified/);
  assert.equal(await readFile(second, 'utf8'), 'after second');
});

test('rejects concurrent locks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-lock-'));
  await withLock(root, async () => assert.rejects(() => withLock(root, async () => {}), /active/));
});

test('rejects a receipt that escapes its root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-receipt-'));
  const transaction = await beginTransaction(root, 'project');
  const receipt = await finishTransaction(transaction);
  receipt.files = [{ path: '../../outside', beforeExists: false }];
  await (await import('node:fs/promises')).writeFile(join(root, '.codex-kit', 'transactions', receipt.id, 'receipt.json'), JSON.stringify(receipt));
  await assert.rejects(() => rollbackTransaction(root, receipt.id), /escapes/);
});

test('refuses rollback after a user changes a tracked file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-user-change-'));
  const target = join(root, 'AGENTS.md');
  await writeFile(target, 'before');
  const transaction = await beginTransaction(root, 'project');
  await writeTracked(transaction, target, 'after');
  const receipt = await finishTransaction(transaction);
  await writeFile(target, 'user change');
  await assert.rejects(() => rollbackTransaction(root, receipt.id), /user-modified/);
});
