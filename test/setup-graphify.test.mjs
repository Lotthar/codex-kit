import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const setupScript = fileURLToPath(new URL('../setup-graphify-codex.mjs', import.meta.url));

async function fixture(complete) {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-graphify-'));
  const home = join(root, 'home');
  const bin = join(home, '.local', 'bin');
  const log = join(root, 'graphify.log');
  await mkdir(bin, { recursive: true });
  await writeFile(join(root, 'index.js'), 'export const value = 1;\n');
  assert.equal(spawnSync('git', ['-C', root, 'init']).status, 0);

  const fake = join(bin, 'graphify.mjs');
  await writeFile(fake, `import fs from 'node:fs';
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_GRAPHIFY_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'update') {
  fs.mkdirSync('graphify-out', { recursive: true });
  fs.writeFileSync('graphify-out/graph.json', '{}\\n');
  if (process.env.FAKE_GRAPHIFY_COMPLETE === '1') fs.writeFileSync('graphify-out/GRAPH_REPORT.md', '# Graph\\n');
}
`);
  if (process.platform === 'win32') {
    await writeFile(join(bin, 'graphify.cmd'), '@echo off\r\nnode "%~dp0graphify.mjs" %*\r\n');
  } else {
    const executable = join(bin, 'graphify');
    await writeFile(executable, '#!/bin/sh\nexec node "$(dirname "$0")/graphify.mjs" "$@"\n');
    await chmod(executable, 0o755);
  }

  const result = spawnSync('node', [setupScript, root, '--skip-install', '--skip-user-config', '--skip-git-hooks'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      FAKE_GRAPHIFY_LOG: log,
      FAKE_GRAPHIFY_COMPLETE: complete ? '1' : '0'
    }
  });
  return { root, log, result };
}

test('uses the no-key Graphify update path and requires both graph artifacts', async () => {
  const incomplete = await fixture(false);
  assert.notEqual(incomplete.result.status, 0);
  assert.match(`${incomplete.result.stdout}${incomplete.result.stderr}${incomplete.result.error?.message ?? ''}`, /did not produce required artifacts: graphify-out[/\\\\]GRAPH_REPORT\.md/);
  assert.ok((await readFile(incomplete.log, 'utf8')).split(/\r?\n/u).includes('["update","."]'));

  const complete = await fixture(true);
  assert.equal(complete.result.status, 0, complete.result.stderr || complete.result.stdout);
  const policy = await readFile(join(complete.root, 'AGENTS.md'), 'utf8');
  assert.match(policy, /graphify update \./);
  assert.match(policy, /commit that delta in a Graphify-only follow-up/);
});
