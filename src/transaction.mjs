import { copyFile, cp, lstat, mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { atomicWrite, exists, nowId, readJson } from './util.mjs';
import { isWithin } from './platform.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const transactionsDir = (root) => join(root, '.codex-kit', 'transactions');
const transactionIdPattern = /^\d{4}-\d{2}-\d{2}T[0-9-]+Z-[a-f0-9]{8}$/;

async function assertSafeTarget(root, candidate) {
  if (!isWithin(root, candidate)) throw new Error(`Transaction target escapes root: ${candidate}`);
  const rel = relative(resolve(root), resolve(candidate));
  let current = resolve(root);
  for (const part of rel.split(sep).filter(Boolean)) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symlink or junction in transaction target: ${current}`);
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
}

export async function pathHash(path) {
  const details = await stat(path);
  if (!details.isDirectory()) return hash(await readFile(path));
  const parts = [];
  for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) parts.push(`${entry.name}:${await pathHash(join(path, entry.name))}`);
  return hash(parts.join('\n'));
}

export async function withLock(root, callback) {
  const lockPath = join(root, '.codex-kit', 'lock');
  await assertSafeTarget(root, lockPath);
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
  await assertSafeTarget(root, dir);
  await mkdir(join(dir, 'backups'), { recursive: true });
  return { id, root, scope, dir, files: [], actions: [], startedAt: new Date().toISOString() };
}

export async function writeTracked(transaction, path, content) {
  await assertSafeTarget(transaction.root, path);
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

export async function copyTracked(transaction, source, destination) {
  await assertSafeTarget(transaction.root, destination);
  if (exists(destination)) return false;
  const staging = `${destination}.codex-kit-stage-${process.pid}-${Date.now()}`;
  await mkdir(dirname(destination), { recursive: true });
  try {
    await cp(source, staging, { recursive: true, dereference: false, errorOnExist: true });
    await rename(staging, destination);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  transaction.files.push({ path: relative(transaction.root, destination), beforeExists: false, backup: null, beforeHash: null, afterHash: await pathHash(destination) });
  return true;
}

export async function replaceTracked(transaction, source, destination) {
  await assertSafeTarget(transaction.root, destination);
  if (!exists(destination)) return copyTracked(transaction, source, destination);
  const rel = relative(transaction.root, destination);
  const beforeHash = await pathHash(destination);
  const backup = join(transaction.dir, 'backups', `${transaction.files.length}-${basename(destination)}`);
  const staging = `${destination}.codex-kit-stage-${process.pid}-${Date.now()}`;
  await mkdir(dirname(destination), { recursive: true });
  try { await cp(source, staging, { recursive: true, dereference: false, errorOnExist: true }); }
  catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
  try {
    await rename(destination, backup);
    try { await rename(staging, destination); }
    catch (error) { await rename(backup, destination); throw error; }
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  transaction.files.push({ path: rel, beforeExists: true, backup: relative(transaction.dir, backup), beforeHash, afterHash: await pathHash(destination) });
  return true;
}

export async function removeTracked(transaction, path) {
  await assertSafeTarget(transaction.root, path);
  if (!exists(path)) return false;
  const rel = relative(transaction.root, path);
  const beforeHash = await pathHash(path);
  const backup = join(transaction.dir, 'backups', `${transaction.files.length}-${basename(path)}`);
  await rename(path, backup);
  transaction.files.push({ path: rel, beforeExists: true, backup: relative(transaction.dir, backup), beforeHash, afterHash: null });
  return true;
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
  const operations = [];
  for (const file of [...receipt.files].reverse()) {
    if (!file || typeof file.path !== 'string' || isAbsolute(file.path)) throw new Error('Invalid transaction target.');
    const target = join(root, file.path);
    await assertSafeTarget(root, target);
    if (exists(target) && file.afterHash === null) throw new Error(`Refusing to overwrite user-recreated transaction target: ${file.path}`);
    if (exists(target) && file.afterHash && (await pathHash(target)) !== file.afterHash) throw new Error(`Refusing to overwrite user-modified transaction target: ${file.path}`);
    let backup = null;
    if (file.beforeExists) {
      if (typeof file.backup !== 'string' || isAbsolute(file.backup)) throw new Error('Invalid transaction backup.');
      backup = join(receiptDir, file.backup);
      await assertSafeTarget(receiptDir, backup);
      if (!exists(backup) || (file.beforeHash && await pathHash(backup) !== file.beforeHash)) throw new Error(`Invalid transaction backup: ${file.path}`);
    }
    operations.push({ file, target, backup });
  }
  for (const { file, target, backup } of operations) {
    if (file.beforeExists) {
      await rm(target, { recursive: true, force: true });
      await mkdir(dirname(target), { recursive: true });
      await cp(backup, target, { recursive: true, dereference: false, errorOnExist: true });
    }
    else await rm(target, { recursive: true, force: true });
  }
  return { status: 'ok', transactionId: receipt.id, actions: [{ state: 'changed', label: 'rollback transaction', detail: receipt.id }] };
}
