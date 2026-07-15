import { dirname, parse, relative, resolve, sep } from 'node:path';
import { lstat, readFile } from 'node:fs/promises';

export function parentOrSelf(path) { const parent = dirname(path); return parent === path ? path : parent; }

export function isWithin(root, candidate) {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !parse(rel).root);
}

export function detectEol(text) { return text.includes('\r\n') ? '\r\n' : '\n'; }

export function withEol(text, eol) { return eol === '\n' ? text : text.replace(/\n/g, eol); }

export async function readText(path, fallback = '') {
  try { return await readFile(path, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

export async function rejectLinks(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error(`Symlinks and junctions are not portable: ${path}`);
  return stat;
}
