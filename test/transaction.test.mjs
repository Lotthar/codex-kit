import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beginTransaction, finishTransaction, rollbackTransaction, withLock, writeTracked } from '../src/transaction.mjs';

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
