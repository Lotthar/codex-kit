import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';

const files = [
  'bin/codex-kit.mjs',
  ...(await readdir('src'))
    .filter((file) => file.endsWith('.mjs'))
    .map((file) => `src/${file}`),
];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
