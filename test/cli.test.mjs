import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { foundationRecommendations, main } from '../src/cli.mjs';
import { run } from '../src/util.mjs';

test('always recommends the scoped developer foundation', () => {
  assert.deepEqual(foundationRecommendations().map(({ id, scope }) => ({ id, scope })), [
    { id: 'ponytail', scope: 'global' },
    { id: 'ruflo', scope: 'global' },
    { id: 'model-routing', scope: 'global' },
    { id: 'graphify', scope: 'project' }
  ]);
  assert.match(foundationRecommendations(true)[3].detail, /strongly recommended/);
});

test('supports flags before commands and rejects unknown flags', async () => {
  assert.equal(await main(['--json', 'doctor']), 0);
  assert.equal(await main(['--not-a-real-flag', 'doctor']), 1);
});

test('dry-run wins over yes', async () => {
  assert.equal(await main(['setup', '--yes', '--dry-run', '--home', '/tmp/codex-kit-cli-home', '--json']), 0);
});

test('routes project inspection, component, skill, recovery, export, and config previews', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-cli-project-'));
  assert.equal(run('git', ['-C', root, 'init']).status, 0);
  await writeFile(join(root, 'package.json'), '{}');
  const skillSource = await mkdtemp(join(tmpdir(), 'codex-kit-cli-skill-'));
  await mkdir(join(skillSource, 'sample'));
  await writeFile(join(skillSource, 'sample', 'SKILL.md'), '---\nname: sample\ndescription: sample\n---\n');
  const commands = [
    ['project', 'status', '--root', root, '--json'],
    ['component', 'list', '--root', root, '--json'],
    ['component', 'add', 'workflow-skills', '--root', root, '--json'],
    ['skill', 'import', 'sample', '--source', skillSource, '--root', root, '--json'],
    ['diff', '--root', root, '--json'],
    ['history', '--root', root, '--json'],
    ['rollback', '--root', root, '--json'],
    ['update', '--check', '--json'],
    ['export', '--source', root, '--json'],
    ['config', 'set', 'features.example', '--value', 'true', '--json']
  ];
  for (const command of commands) assert.equal(await main(command), 0, command.join(' '));
});
