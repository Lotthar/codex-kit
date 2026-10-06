import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brainRegister } from '../src/brain-registry.mjs';
import { applyProject, projectPlan } from '../src/project.mjs';
import { run, exists } from '../src/util.mjs';

const cli = fileURLToPath(new URL('../bin/codex-kit.mjs', import.meta.url));
const invoke = (args) => { const result = run(process.execPath, [cli, ...args, '--json']); return { ...result, result: JSON.parse(result.stdout) }; };
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'kit-brain-cli-root-'));
  const home = await mkdtemp(join(tmpdir(), 'kit-brain-cli-home-'));
  assert.equal(run('git', ['-C', root, 'init']).status, 0);
  await writeFile(join(root, 'package.json'), '{}');
  const project = await applyProject(await projectPlan({ root, preset: 'personal' }));
  return { root, home, key: project.config.tools.obsidian.projectKey };
}

test('public setup and init previews expose registration and indexing without writes', async () => {
  const { root, home } = await fixture();
  for (const command of [['project', 'refresh'], ['component', 'add', 'obsidian-brain'], ['brain', 'init']]) {
    const { result } = invoke([...command, '--root', root, '--home', home, '--yes', '--dry-run']);
    assert.ok(result.actions.some((item) => item.state === 'planned' && /register/.test(item.label)));
    assert.ok(result.actions.some((item) => item.state === 'planned' && /reconcile/.test(item.label)));
    assert.equal(exists(join(home, '.codex-kit', 'brain-registry.json')), false);
  }
});

test('public upgrade apply requires a reviewed manifest hash before writing', async () => {
  const home = await mkdtemp(join(tmpdir(), 'kit-brain-cli-home-'));
  const attempted = invoke(['upgrade', '--all', '--home', home, '--yes']);
  assert.equal(attempted.status, 1);
  assert.match(attempted.result.error, /expected-hash|manifest hash/i);
  assert.equal(exists(join(home, '.codex-kit', 'upgrades')), false);
  const preview = invoke(['upgrade', '--all', '--home', home, '--yes', '--dry-run']);
  assert.equal(preview.status, 0);
  assert.match(preview.result.manifestHash, /^[a-f0-9]{64}$/);
});

test('registry destination conflict stops migration before config or vault access', async () => {
  const { root, home, key } = await fixture();
  await brainRegister({ home, key, name: 'Source', root, kind: 'git', execute: true });
  await brainRegister({ home, key: 'occupied-destination', name: 'Other', externalId: 'work:other', kind: 'external', execute: true });
  const configPath = join(root, '.codex-kit', 'config.json');
  const before = await readFile(configPath, 'utf8');
  const attempted = invoke(['brain', 'migrate', '--to', 'occupied-destination', '--root', root, '--home', home, '--yes']);
  assert.equal(attempted.status, 1);
  assert.equal(attempted.result.status, 'partial');
  assert.match(attempted.result.actions[0].detail, /Destination.*already exists/);
  assert.equal(await readFile(configPath, 'utf8'), before);
  assert.equal(exists(join(home, 'brain.json')), false);
});
