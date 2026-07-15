import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyGlobal, applyModelRoutingPlan, globalPlan, modelRoutingStatus } from '../src/global.mjs';
import { modelRoutingStatePath, parseModelCatalog, resolveModelRouting } from '../src/model-routing.mjs';

const catalog = [
  { slug: 'gpt-5.6-sol', supported_reasoning_levels: [{ effort: 'high' }] },
  { slug: 'gpt-5.6-terra', supported_reasoning_levels: [{ effort: 'medium' }, { effort: 'high' }] },
  { slug: 'gpt-5.6-luna', supported_reasoning_levels: [{ effort: 'low' }] },
  { slug: 'gpt-5.5', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }, { effort: 'high' }] },
  { slug: 'gpt-5.4', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }, { effort: 'high' }] }
];

test('resolves the approved model tiers and inherits when no catalog is available', () => {
  const resolved = resolveModelRouting(catalog);
  assert.deepEqual(resolved.assets.map(({ id, model, effort }) => ({ id, model, effort })), [
    { id: 'orchestrator', model: 'gpt-5.6-sol', effort: 'high' },
    { id: 'mapper', model: 'gpt-5.6-terra', effort: 'medium' },
    { id: 'worker', model: 'gpt-5.6-terra', effort: 'medium' },
    { id: 'reviewer', model: 'gpt-5.6-terra', effort: 'high' },
    { id: 'support', model: 'gpt-5.6-luna', effort: 'low' }
  ]);
  assert.ok(resolveModelRouting(null).assets.every((asset) => asset.model === null && asset.effort === null));
  assert.equal(parseModelCatalog('not JSON'), null);
});

test('provisions owned role files, preserves collisions, and is idempotent', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-routing-'));
  const routing = resolveModelRouting(catalog);
  const first = await applyModelRoutingPlan({ home, routing });
  assert.equal(first.status, 'ok');
  assert.match(await readFile(join(home, 'agents', 'codex_kit_mapper.toml'), 'utf8'), /gpt-5.6-terra/);
  const second = await applyModelRoutingPlan({ home, routing });
  assert.ok(second.actions.every((item) => item.state === 'unchanged'));

  const worker = join(home, 'agents', 'codex_kit_worker.toml');
  await writeFile(worker, '# User customisation\n');
  const refreshed = await applyModelRoutingPlan({ home, routing });
  assert.equal(refreshed.status, 'partial');
  assert.match(await readFile(worker, 'utf8'), /User customisation/);
});

test('global setup provisions its policy and status reports installed role state', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-routing-global-'));
  const plan = await globalPlan({ home, modelRouting: true, catalog });
  const applied = await applyGlobal(plan);
  assert.equal(applied.status, 'ok');
  assert.match(await readFile(join(home, 'AGENTS.md'), 'utf8'), /Optional model routing/);
  assert.ok((await modelRoutingStatus({ home, catalog })).actions.every((item) => item.state === 'unchanged'));
});

test('rejects a state target that escapes Codex home before reading it', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-routing-state-'));
  await mkdir(join(home, '.codex-kit'));
  await writeFile(modelRoutingStatePath(home), JSON.stringify({ assets: [{ target: '../outside', hash: 'x' }] }));
  await assert.rejects(() => applyModelRoutingPlan({ home, routing: resolveModelRouting(catalog) }), /Invalid model-routing state target/);
});
