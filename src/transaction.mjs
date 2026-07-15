import { copyFile, mkdir, open, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { basename, isAbsolute, join, relative } from 'node:path';
import { atomicWrite, exists, nowId, readJson } from './util.mjs';
import { isWithin } from './platform.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const transactionsDir = (root) => join(root, '.codex-kit', 'transactions');
const transactionIdPattern = /^\d{4}-\d{2}-\d{2}T[0-9-]+Z-[a-f0-9]{8}$/;

export async function pathHash(path) {
  const details = await stat(path);
  if (!details.isDirectory()) return hash(await readFile(path));
  const parts = [];
  for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) parts.push(`${entry.name}:${await pathHash(join(path, entry.name))}`);
  return hash(parts.join('\n'));
}

export async function withLock(root, callback) {
  const lockPath = join(root, '.codex-kit', 'lock');
  await mkdir(join(root, '.codex-kit'), { recursive: true });
  let handle;
  try { handle = await open(lockPath, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const ageMs = Date.now() - (await stat(lockPath)).mtimeMs;
    if (ageMs < 10 * 60_000) throw new Error(`Another Codex Kit transaction is active: ${lockPath}`);
    await rm(lockPath, { force: true });
    handle = await open(lockPath, 'wx');
  }
  try { return await callback(); } finally { await handle.close(); await rm(lockPath, { force: true }); }
}

export async function beginTransaction(root, scope) {
  const id = `${nowId()}-${randomUUID().slice(0, 8)}`;
  const dir = join(transactionsDir(root), id);
  await mkdir(join(dir, 'backups'), { recursive: true });
  return { id, root, scope, dir, files: [], actions: [], startedAt: new Date().toISOString() };
}

export async function writeTracked(transaction, path, content) {
  if (!isWithin(transaction.root, path)) throw new Error(`Transaction target escapes root: ${path}`);
  const rel = relative(transaction.root, path);
  const beforeExists = exists(path);
  let backup = null;
  let beforeHash = null;
  if (beforeExists) {
    const source = await (await import('node:fs/promises')).readFile(path);
    beforeHash = hash(source);
    backup = join(transaction.dir, 'backups', `${transaction.files.length}-${basename(path)}`);
    await copyFile(path, backup);
  }
  await atomicWrite(path, content);
  transaction.files.push({ path: rel, beforeExists, backup: backup ? relative(transaction.dir, backup) : null, beforeHash, afterHash: hash(content) });
}

export function recordAction(transaction, action) { transaction.actions.push(action); }

export async function finishTransaction(transaction, status = 'ok') {
  const receipt = { schemaVersion: 2, id: transaction.id, scope: transaction.scope, status, startedAt: transaction.startedAt, finishedAt: new Date().toISOString(), files: transaction.files, actions: transaction.actions };
  await writeFile(join(transaction.dir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

export async function listTransactions(root) {
  if (!exists(transactionsDir(root))) return [];
  const names = (await readdir(transactionsDir(root), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
  return Promise.all(names.map(async (directoryId) => {
    const receipt = await readJson(join(transactionsDir(root), directoryId, 'receipt.json')).catch(() => null);
    return receipt ? { ...receipt, directoryId } : null;
  })).then((items) => items.filter(Boolean));
}

export async function rollbackTransaction(root, requestedId) {
  const receipts = await listTransactions(root);
  const receipt = requestedId ? receipts.find((item) => item.directoryId === requestedId) : receipts[0];
  if (!receipt || receipt.schemaVersion !== 2 || !Array.isArray(receipt.files) || receipt.id !== receipt.directoryId || !transactionIdPattern.test(receipt.directoryId)) throw new Error('Invalid Codex Kit transaction receipt.');
  const receiptDir = join(transactionsDir(root), receipt.directoryId);
  for (const file of [...receipt.files].reverse()) {
    if (!file || typeof file.path !== 'string' || isAbsolute(file.path)) throw new Error('Invalid transaction target.');
    const target = join(root, file.path);
    if (!isWithin(root, target)) throw new Error('Transaction target escapes its root.');
    if (exists(target) && file.afterHash && (await pathHash(target)) !== file.afterHash) throw new Error(`Refusing to overwrite user-modified transaction target: ${file.path}`);
    if (file.beforeExists) {
      if (typeof file.backup !== 'string' || isAbsolute(file.backup)) throw new Error('Invalid transaction backup.');
      const backup = join(receiptDir, file.backup);
      if (!isWithin(receiptDir, backup)) throw new Error('Transaction backup escapes its receipt.');
      await copyFile(backup, target);
    }
    else await rm(target, { recursive: true, force: true });
  }
  return { status: 'ok', transactionId: receipt.id, actions: [{ state: 'changed', label: 'rollback transaction', detail: receipt.id }] };
}
