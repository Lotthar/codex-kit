import { mkdir, readFile, rename, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

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
  await rename(temp, path);
}

export async function backup(path, root) {
  if (!exists(path)) return null;
  const destination = join(root, '.codex-kit', 'backups', `${nowId()}-${path.split('/').filter(Boolean).join('__')}`);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(path, destination);
  return destination;
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8', shell: false, timeout: options.timeout ?? 30_000 });
  return { command, args, status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error?.message };
}

export function print(value, json) {
  if (json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else for (const action of value.actions ?? []) process.stdout.write(`${action.state.toUpperCase()} ${action.label}${action.detail ? ` — ${action.detail}` : ''}\n`);
}

export function action(state, label, detail = '') { return { state, label, detail }; }

export function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) { positional.push(item); continue; }
    const [key, inline] = item.slice(2).split('=', 2);
    if (inline !== undefined) options[key] = inline;
    else if (argv[index + 1] && !argv[index + 1].startsWith('--')) options[key] = argv[++index];
    else options[key] = true;
  }
  return { positional, options };
}
