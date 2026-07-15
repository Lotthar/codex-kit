import { mkdir, readFile, rename, writeFile, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import spawn from 'cross-spawn';

export const nowId = () => new Date().toISOString().replace(/[:.]/g, '-');
export const exists = (path) => existsSync(path);

export async function readJson(path, fallback = undefined) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}

export async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temp, content, 'utf8');
  try {
    for (let attempt = 0; ; attempt += 1) {
      try { await rename(temp, path); break; }
      catch (error) {
        if (attempt >= 2 || !['EPERM', 'EBUSY'].includes(error.code)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
  }
  catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

export async function backup(path, root) {
  if (!exists(path)) return null;
  const rel = relative(root, path);
  if (!rel || rel.startsWith('..') || rel.split(sep).includes('..')) throw new Error(`Backup target escapes root: ${path}`);
  const safe = rel.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
  const destination = join(root, '.codex-kit', 'backups', `${nowId()}-${safe}`);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(path, destination);
  return destination;
}

export function run(command, args, options = {}) {
  const result = spawn.sync(command, args, { cwd: options.cwd, encoding: 'utf8', shell: false, timeout: options.timeout ?? 30_000, input: options.input });
  return { command, args, status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error?.message };
}

export function print(value, json) {
  if (json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else {
    if (value.status) process.stdout.write(`${value.status.toUpperCase()}\n`);
    for (const action of value.actions ?? []) process.stdout.write(`${action.state.toUpperCase()} ${action.label}${action.detail ? ` — ${action.detail}` : ''}\n`);
    if (value.diff) process.stdout.write(`${value.diff}\n`);
  }
}

export function action(state, label, detail = '', extra = {}) { return { state, label, detail, ...extra }; }
