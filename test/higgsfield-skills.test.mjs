import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyGlobal, globalPlan } from '../src/global.mjs';

const skills = [
  'higgsfield-brandkit',
  'higgsfield-faceless-video',
  'higgsfield-generate',
  'higgsfield-marketplace-cards',
  'higgsfield-product-photoshoot',
  'higgsfield-soul-id',
  'higgsfield-video-explainer',
  'higgsfield-websites',
  'higgsfield-youtube-thumbnail'
];

test('bundles and plans every Higgsfield skill globally', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-higgsfield-plan-'));
  const plan = await globalPlan({ home, preset: 'minimal' });
  for (const name of skills) {
    await access(join('workflow-skills', name, 'SKILL.md'));
    const action = plan.actions.find((item) => item.label === `provision skills/${name}`);
    assert.equal(action?.state, 'planned');
    assert.equal(action?.detail, 'base-policy');
  }
});

test('global Higgsfield setup installs, records, and preserves all Kit-owned skills', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-higgsfield-install-'));
  const first = await applyGlobal(await globalPlan({ home, preset: 'minimal' }));
  assert.equal(first.status, 'ok');
  assert.match(await readFile(join(home, 'AGENTS.md'), 'utf8'), /do not run their unpinned remote CLI bootstrap/);
  const receipt = JSON.parse(await readFile(join(home, '.codex-kit', 'global-assets.json'), 'utf8'));
  for (const name of skills) {
    assert.match(await readFile(join(home, 'skills', name, 'SKILL.md'), 'utf8'), new RegExp(`name: ${name}`));
    assert.equal(receipt.assets.some((asset) => asset.target === `skills/${name}` && asset.component === 'base-policy'), true);
  }

  const second = await applyGlobal(await globalPlan({ home, preset: 'minimal' }));
  assert.equal(second.status, 'ok');
  for (const name of skills) assert.equal(second.actions.find((item) => item.label === `provision skills/${name}`)?.state, 'unchanged');
});

test('global Higgsfield setup preserves one user-owned skill while installing the others', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-higgsfield-collision-'));
  const name = 'higgsfield-generate';
  const target = join(home, 'skills', name, 'SKILL.md');
  await mkdir(join(home, 'skills', name), { recursive: true });
  await writeFile(target, '# User-owned Higgsfield skill\n');

  const result = await applyGlobal(await globalPlan({ home, preset: 'minimal' }));
  assert.equal(result.status, 'partial');
  assert.equal(await readFile(target, 'utf8'), '# User-owned Higgsfield skill\n');
  assert.equal(result.actions.find((item) => item.label === `provision skills/${name}`)?.state, 'conflict');
  assert.match(await readFile(join(home, 'skills', 'higgsfield-soul-id', 'SKILL.md'), 'utf8'), /name: higgsfield-soul-id/);
});
