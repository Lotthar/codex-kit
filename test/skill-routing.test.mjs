import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyGlobal, globalPlan } from '../src/global.mjs';
import { pathHash } from '../src/transaction.mjs';
import { catalogSkillInventory, homeSkillInventory } from '../scripts/skill-inventory.mjs';

const entrypoints = ['humanizer', 'kit-engineering', 'kit-ui', 'kit-media'];
const legacySkills = [
  'higgsfield-brandkit', 'higgsfield-faceless-video', 'higgsfield-generate', 'higgsfield-marketplace-cards',
  'higgsfield-product-photoshoot', 'higgsfield-soul-id', 'higgsfield-video-explainer', 'higgsfield-websites', 'higgsfield-youtube-thumbnail',
  'banner-design', 'brand', 'design', 'design-system', 'slides', 'ui-styling', 'ui-ux-pro-max',
  'ask-matt', 'code-review', 'codebase-design', 'diagnosing-bugs', 'domain-modeling', 'grill-me', 'grill-with-docs', 'grilling',
  'handoff', 'implement', 'implement-spec', 'improve-codebase-architecture', 'pr', 'prototype', 'research', 'retro',
  'setup-matt-pocock-skills', 'tdd', 'teach', 'to-questionnaire', 'to-spec', 'to-tickets', 'triage', 'wait-what', 'wayfinder',
  'wizard', 'writing-for-agents', 'karpathy-guidelines'
];
const installedSkills = [...entrypoints, ...legacySkills];

test('catalog exposes only the four compact implicit routing entrypoints', async () => {
  const inventory = await catalogSkillInventory();
  assert.equal(inventory.total, installedSkills.length);
  assert.equal(inventory.implicit, entrypoints.length);
  assert.deepEqual(inventory.skills.filter((skill) => skill.implicit).map((skill) => skill.name).sort(), [...entrypoints].sort());
  assert.ok(inventory.implicitFrontmatterBytes > 0);
  assert.deepEqual(inventory.skills.map((skill) => skill.name).sort(), [...installedSkills].sort());
});

test('installed inventory skips containers, follows skill symlinks, and counts UTF-8 frontmatter bytes', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-skill-inventory-'));
  const skills = join(home, 'skills');
  await mkdir(join(skills, '.system'), { recursive: true });
  await writeFile(join(skills, 'README.txt'), 'not a skill\n');
  await mkdir(join(skills, 'automatic'), { recursive: true });
  await writeFile(join(skills, 'automatic', 'SKILL.md'), '---\nname: café\n---\n# Automatic\n');
  await mkdir(join(skills, 'explicit', 'agents'), { recursive: true });
  await writeFile(join(skills, 'explicit', 'SKILL.md'), '---\nname: Explicit\n---\n# Explicit\n');
  await writeFile(join(skills, 'explicit', 'agents', 'openai.yaml'), 'policy:\n  allow_implicit_invocation: false\n');
  await symlink(join(skills, 'automatic'), join(skills, 'linked-automatic'), 'dir');

  const inventory = await homeSkillInventory(home);
  assert.equal(inventory.total, 3);
  assert.equal(inventory.implicit, 2);
  assert.equal(inventory.implicitFrontmatterBytes, Buffer.byteLength('name: café', 'utf8') * 2);
  assert.deepEqual(inventory.skills.map((skill) => [skill.name, skill.implicit]), [
    ['automatic', true], ['explicit', false], ['linked-automatic', true]
  ]);
});

test('global setup retains explicit specialist skills, policies, interfaces, and receipts', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-skill-routing-'));
  const result = await applyGlobal(await globalPlan({ home, preset: 'minimal' }));
  assert.equal(result.status, 'ok');

  const receipt = JSON.parse(await readFile(join(home, '.codex-kit', 'global-assets.json'), 'utf8'));
  assert.equal(receipt.assets.filter((asset) => asset.component === 'base-policy').length, installedSkills.length);
  for (const name of installedSkills) {
    await access(join(home, 'skills', name, 'SKILL.md'));
    assert.equal(receipt.assets.some((asset) => asset.target === `skills/${name}` && asset.component === 'base-policy'), true);
  }
  for (const name of legacySkills) {
    const policy = await readFile(join(home, 'skills', name, 'agents', 'openai.yaml'), 'utf8');
    assert.match(policy, /allow_implicit_invocation: false/);
  }
  const askMatt = await readFile(join(home, 'skills', 'ask-matt', 'agents', 'openai.yaml'), 'utf8');
  assert.match(askMatt, /display_name: "Ask Matt"/);
  assert.match(askMatt, /short_description: "Find the right skill or workflow"/);

  const inventory = await homeSkillInventory(home);
  assert.equal(inventory.total, installedSkills.length);
  assert.equal(inventory.implicit, entrypoints.length);
  assert.deepEqual(inventory.skills.filter((skill) => skill.implicit).map((skill) => skill.name).sort(), [...entrypoints].sort());
});

test('global setup upgrades a receipt-owned specialist with its explicit-only metadata', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-skill-routing-upgrade-'));
  const directory = join(home, 'skills', 'ui-ux-pro-max');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'SKILL.md'), '# Older Kit-owned UI skill\n');
  await mkdir(join(home, '.codex-kit'), { recursive: true });
  await writeFile(join(home, '.codex-kit', 'global-assets.json'), `${JSON.stringify({ schemaVersion: 1, assets: [{
    component: 'base-policy',
    source: 'workflow-skills/ui-ux-pro-max',
    target: 'skills/ui-ux-pro-max',
    hash: await pathHash(directory)
  }] }, null, 2)}\n`);

  const result = await applyGlobal(await globalPlan({ home, preset: 'minimal' }));
  assert.equal(result.status, 'ok');
  assert.equal(result.actions.find((item) => item.label === 'update skills/ui-ux-pro-max')?.state, 'changed');
  assert.match(await readFile(join(directory, 'agents', 'openai.yaml'), 'utf8'), /allow_implicit_invocation: false/);
  const receipt = JSON.parse(await readFile(join(home, '.codex-kit', 'global-assets.json'), 'utf8'));
  const asset = receipt.assets.find((item) => item.target === 'skills/ui-ux-pro-max');
  assert.equal(asset?.hash, await pathHash(directory));
});

test('a modified specialist remains user-owned while routing entrypoints still install', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-skill-routing-collision-'));
  const target = join(home, 'skills', 'ui-ux-pro-max', 'SKILL.md');
  await mkdir(join(home, 'skills', 'ui-ux-pro-max'), { recursive: true });
  await writeFile(target, '# User-owned UI skill\n');
  const result = await applyGlobal(await globalPlan({ home, preset: 'minimal' }));
  assert.equal(result.status, 'partial');
  assert.equal(await readFile(target, 'utf8'), '# User-owned UI skill\n');
  assert.equal(result.actions.find((item) => item.label === 'provision skills/ui-ux-pro-max')?.state, 'conflict');
  for (const name of entrypoints) await access(join(home, 'skills', name, 'SKILL.md'));
});
