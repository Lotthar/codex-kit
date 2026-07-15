import { cp, lstat, mkdir, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { exists, readJson } from './util.mjs';
import { findProjectRoot } from './project.mjs';
import { isWithin } from './platform.mjs';
import { beginTransaction, finishTransaction, pathHash, withLock, writeTracked } from './transaction.mjs';

const sensitive = /^(?:auth\.json|config\.toml|\.env(?:\..*)?|.*(?:token|secret|credential).*)$/i;
const maxFileBytes = 1024 * 1024;

async function inspectTree(root, path = root) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const absolute = join(path, entry.name);
    const rel = relative(root, absolute);
    if (!isWithin(root, absolute) || sensitive.test(entry.name) || entry.name === '.git') throw new Error(`Refusing to import sensitive or invalid path: ${rel}`);
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink() || !stat.isFile() && !stat.isDirectory()) throw new Error(`Refusing non-portable skill entry: ${rel}`);
    if (stat.isFile() && stat.size > maxFileBytes) throw new Error(`Skill file exceeds ${maxFileBytes} bytes: ${rel}`);
    if (stat.isDirectory()) await inspectTree(root, absolute);
  }
}

async function digestTree(root, path = root, chunks = []) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const absolute = join(path, entry.name);
    if (entry.isDirectory()) await digestTree(root, absolute, chunks);
    else chunks.push(`${relative(root, absolute)}:${createHash('sha256').update(await readFile(absolute)).digest('hex')}`);
  }
  return createHash('sha256').update(chunks.sort().join('\n')).digest('hex');
}

export async function importSkill({ root, sourceRoot, name, execute = false }) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) throw new Error('Skill name must contain only letters, numbers, and hyphens.');
  const projectRoot = await findProjectRoot(root);
  const source = resolve(sourceRoot, name);
  const destination = join(projectRoot, '.agents', 'skills', name);
  if (!isWithin(sourceRoot, source) || !exists(source) || !exists(join(source, 'SKILL.md'))) throw new Error(`No portable skill with SKILL.md found at ${source}`);
  if ((await lstat(resolve(sourceRoot))).isSymbolicLink() || (await lstat(source)).isSymbolicLink()) throw new Error('Skill source roots cannot be symlinks or junctions.');
  if (exists(destination)) throw new Error(`Destination already exists: ${destination}`);
  await inspectTree(source);
  const contentHash = await digestTree(source);
  const result = { status: 'ok', root: projectRoot, source: '<redacted>', destination, actions: [{ state: 'planned', label: 'import project skill', detail: `${name} with provenance`, reversibility: 'full' }] };
  if (!execute) return result;
  return withLock(projectRoot, async () => {
    const transaction = await beginTransaction(projectRoot, 'project');
    try {
      await mkdir(join(projectRoot, '.agents', 'skills'), { recursive: true });
      await cp(source, destination, { recursive: true, errorOnExist: true, dereference: false });
      transaction.files.push({ path: relative(projectRoot, destination), beforeExists: false, backup: null, beforeHash: null, afterHash: await pathHash(destination) });
      const receiptPath = join(projectRoot, '.codex-kit', 'imports.json');
      const receipt = await readJson(receiptPath, { schemaVersion: 2, skills: [] });
      receipt.skills.push({ name, contentHash, importedAt: new Date().toISOString() });
      await writeTracked(transaction, receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
      const finished = await finishTransaction(transaction);
      return { ...result, transactionId: finished.id, actions: [{ state: 'changed', label: 'import project skill', detail: name }] };
    } catch (error) {
      const { rollbackTransaction } = await import('./transaction.mjs');
      const receipt = await finishTransaction(transaction, 'failed');
      await rollbackTransaction(projectRoot, receipt.id);
      throw error;
    }
  });
}
