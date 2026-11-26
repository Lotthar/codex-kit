import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyGlobal, globalPlan } from '../src/global.mjs';
import { pathHash } from '../src/transaction.mjs';

const skills = ['brandkit', 'creative-director', 'faceless-video', 'generate', 'marketplace-cards', 'product-photoshoot', 'soul-id', 'video-explainer', 'websites', 'youtube-thumbnail'].map((name) => `higgsfield-${name}`);

test('ordinary setup preserves retired Higgsfield receipts and existing or modified files', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-retired-higgsfield-'));
  const assets = [];
  for (const name of skills) {
    const dir = join(home, 'skills', name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), `original ${name}`);
    assets.push({ component: 'base-policy', source: `workflow-skills/${name}`, target: `skills/${name}`, hash: await pathHash(dir) });
  }
  await writeFile(join(home, 'skills', skills[0], 'SKILL.md'), 'customized');
  await mkdir(join(home, '.codex-kit'), { recursive: true });
  await writeFile(join(home, '.codex-kit', 'global-assets.json'), JSON.stringify({ assets }));
  for (let i = 0; i < 2; i++) {
    await applyGlobal(await globalPlan({ home, preset: 'minimal' }));
    const state = JSON.parse(await readFile(join(home, '.codex-kit', 'global-assets.json'), 'utf8'));
    for (const asset of assets) assert.deepEqual(state.assets.find((item) => item.target === asset.target), asset);
    assert.equal(await readFile(join(home, 'skills', skills[0], 'SKILL.md'), 'utf8'), 'customized');
  }
});

test('fresh setup does not install retired skills', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-retired-fresh-'));
  const result = await applyGlobal(await globalPlan({ home, preset: 'minimal' }));
  assert.equal(result.status, 'ok');
  const state = JSON.parse(await readFile(join(home, '.codex-kit', 'global-assets.json'), 'utf8'));
  assert.ok(skills.every((name) => !state.assets.some((asset) => asset.target === `skills/${name}`)));
});
