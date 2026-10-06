import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brainRegister } from '../src/brain-registry.mjs';
import { brainUpgradePlan, upgradeAll } from '../src/brain-upgrade.mjs';
import { beginTransaction, finishTransaction, writeTracked } from '../src/transaction.mjs';

const temporaryHome = () => mkdtemp(join(tmpdir(), 'codex-kit-brain-upgrade-'));
const ok = (transactionId) => ({ status: 'ok', transactionId, actions: [] });

test('upgrade preview writes no files and omits excluded registry projects', async () => {
  const home = await temporaryHome();
  await brainRegister({ home, key: 'included-work', name: 'Included', externalId: 'work:included', kind: 'external', execute: true });
  await brainRegister({ home, key: 'excluded-work', name: 'Excluded', externalId: 'work:excluded', kind: 'external', inclusion: 'excluded', execute: true });
  const before = await readFile(join(home, '.codex-kit', 'brain-registry.json'), 'utf8');

  const preview = await brainUpgradePlan({ home });
  assert.equal(preview.targets.some((target) => target.id === 'included-work'), true);
  assert.equal(preview.targets.some((target) => target.id === 'excluded-work'), false);
  assert.equal(await readFile(join(home, '.codex-kit', 'brain-registry.json'), 'utf8'), before);
  await assert.rejects(() => readFile(join(home, '.codex-kit', 'upgrades', 'missing', 'run.json')));
});

test('guards apply when its reviewed manifest changes', async () => {
  const home = await temporaryHome();
  const preview = await brainUpgradePlan({ home });
  await writeFile(join(home, 'AGENTS.md'), '<!-- codex-kit:global:start -->\n- Global component: `base-policy`.\n<!-- codex-kit:global:end -->\n');
  await assert.rejects(() => upgradeAll({ home, execute: true, expectedHash: preview.manifestHash }), /expected-hash/);
});

test('requires the reviewed manifest hash for every fresh apply', async () => {
  const home = await temporaryHome();
  await assert.rejects(() => upgradeAll({ home, execute: true }), /expected-hash/);
  const preview = await brainUpgradePlan({ home });
  const result = await upgradeAll({ home, execute: true, expectedHash: preview.manifestHash, operations: { applyGlobal: async () => ok('global-tx'), brainReconcile: async () => ok('index-tx') } });
  assert.equal(result.status, 'ok');
});

test('resumes only partial targets and aligns global components with the selected Brain policy', async () => {
  const home = await temporaryHome();
  await brainRegister({ home, key: 'remote-work', name: 'Remote', externalId: 'work:remote', kind: 'external', execute: true });
  let globalCalls = 0;
  let initCalls = 0;
  const operations = {
    applyGlobal: async (plan) => { globalCalls += 1; assert.equal(plan.components.includes('obsidian-brain'), true); return ok('global-tx'); },
    brainInit: async () => { initCalls += 1; return initCalls === 1 ? { status: 'partial', actions: [{ state: 'failed', label: 'initialize', detail: 'offline' }] } : ok('brain-tx'); },
    brainReconcile: async () => ok('index-tx'),
  };

  const preview = await brainUpgradePlan({ home });
  const partial = await upgradeAll({ home, execute: true, expectedHash: preview.manifestHash, operations });
  assert.equal(partial.status, 'partial');
  assert.equal(globalCalls, 1);
  assert.equal(initCalls, 1);
  const resumed = await upgradeAll({ home, execute: true, resume: partial.upgradeId, expectedHash: preview.manifestHash, operations });
  assert.equal(resumed.status, 'ok');
  assert.equal(globalCalls, 1);
  assert.equal(initCalls, 2);
  assert.equal(resumed.indexed, true);
});

test('does not replace human-managed global content when an injected upgrade worker reports it preserved', async () => {
  const home = await temporaryHome();
  const human = '# Human-owned instructions\n';
  await writeFile(join(home, 'AGENTS.md'), human);
  const preview = await brainUpgradePlan({ home });
  const result = await upgradeAll({ home, execute: true, expectedHash: preview.manifestHash, operations: { applyGlobal: async () => ({ status: 'partial', actions: [{ state: 'conflict', label: 'manage AGENTS.md', detail: 'existing user content preserved' }] }) } });
  assert.equal(result.status, 'partial');
  assert.equal(await readFile(join(home, 'AGENTS.md'), 'utf8'), human);
  assert.equal(result.targets[0].state, 'partial');
});

test('rejects a changed applying target despite an unrelated successful receipt until given a fresh reviewed hash', async () => {
  const home = await temporaryHome();
  const initial = await brainUpgradePlan({ home });
  const partial = await upgradeAll({ home, execute: true, expectedHash: initial.manifestHash, operations: { applyGlobal: async () => ({ status: 'partial', actions: [{ state: 'failed', label: 'apply', detail: 'interrupted' }] }) } });
  const runPath = join(home, '.codex-kit', 'upgrades', partial.upgradeId, 'run.json');
  const state = JSON.parse(await readFile(runPath, 'utf8'));
  state.targets[0].state = 'applying';
  await writeFile(runPath, `${JSON.stringify(state, null, 2)}\n`);
  const receipt = await beginTransaction(home, 'global');
  await writeTracked(receipt, join(home, 'unrelated.txt'), 'unrelated');
  await finishTransaction(receipt);
  await writeFile(join(home, 'AGENTS.md'), '# Changed after interruption\n');
  await assert.rejects(() => upgradeAll({ home, execute: true, resume: partial.upgradeId, expectedHash: initial.manifestHash, operations: { applyGlobal: async () => ok('global-tx') } }), /expected-hash/);
  const fresh = await brainUpgradePlan({ home });
  const resumed = await upgradeAll({ home, execute: true, resume: partial.upgradeId, expectedHash: fresh.manifestHash, operations: { applyGlobal: async () => ok('global-tx'), brainReconcile: async () => ok('index-tx') } });
  assert.equal(resumed.status, 'ok');
  assert.equal(await readFile(join(home, 'AGENTS.md'), 'utf8'), '# Changed after interruption\n');
});
