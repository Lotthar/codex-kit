import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyProject, initProject, modifyProject, projectDiff, projectPlan, rollbackProject } from '../src/project.mjs';
import { pathHash } from '../src/transaction.mjs';
import { run } from '../src/util.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-project-'));
  assert.equal(run('git', ['-C', root, 'init']).status, 0);
  await writeFile(join(root, 'package.json'), '{}');
  await writeFile(join(root, 'AGENTS.md'), '# Human rules\n\nAfter stays.\n');
  return root;
}

test('project plan previews, applies idempotently, and rolls back', async () => {
  const root = await fixture();
  const preview = await initProject({ root });
  assert.equal(preview.actions[1].state, 'planned');
  const applied = await initProject({ root, execute: true });
  assert.equal(applied.status, 'ok');
  const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents, /# Human rules/);
  assert.match(agents, /After stays/);
  assert.equal((await import('node:fs')).existsSync(join(root, '.agents', 'skills', 'prompt-enhancer', 'SKILL.md')), true);
  assert.equal((await import('node:fs')).existsSync(join(root, '.agents', 'skills', 'plan-with-subagents', 'SKILL.md')), true);
  assert.equal((await import('node:fs')).existsSync(join(root, '.agents', 'skills', 'implement-plan-with-subagents', 'SKILL.md')), true);
  assert.equal((await import('node:fs')).existsSync(join(root, 'tools', 'promptx', 'promptx.mjs')), true);
  const diff = await projectDiff(await projectPlan({ root }));
  assert.ok(typeof diff.diff === 'string');
  await rollbackProject(root, applied.transactionId);
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), '# Human rules\n\nAfter stays.\n');
  assert.equal((await import('node:fs')).existsSync(join(root, '.agents', 'skills', 'plan-with-subagents')), false);
});

test('preserves a colliding user-owned skill', async () => {
  const root = await fixture();
  const skill = join(root, '.agents', 'skills', 'plan-with-subagents', 'SKILL.md');
  await mkdir(join(root, '.agents', 'skills', 'plan-with-subagents'), { recursive: true });
  await writeFile(skill, '# User-owned workflow\n');
  const result = await initProject({ root, execute: true });
  assert.equal(result.status, 'partial');
  assert.match(result.actions.find((item) => item.label.includes('plan-with-subagents'))?.state ?? '', /conflict/);
  assert.equal(await readFile(skill, 'utf8'), '# User-owned workflow\n');
});

test('always recommends Graphify and uses complexity only for emphasis', async () => {
  const root = await fixture();
  const plan = await projectPlan({ root });
  const recommendation = plan.actions.find((item) => item.label === 'use Graphify');
  assert.equal(recommendation.state, 'recommended');
  assert.match(recommendation.detail, /recommended/);
});

test('removes only unmodified assets owned by a deselected component', async () => {
  const root = await fixture();
  await initProject({ root, execute: true });
  const planSkill = join(root, '.agents', 'skills', 'plan-with-subagents');
  const implementationSkill = join(root, '.agents', 'skills', 'implement-plan-with-subagents', 'SKILL.md');
  await writeFile(implementationSkill, '# User customization\n');
  const removed = await modifyProject({ root, component: 'workflow-skills', remove: true, execute: true });
  assert.equal(removed.status, 'partial');
  assert.equal((await import('node:fs')).existsSync(planSkill), false);
  assert.equal(await readFile(implementationSkill, 'utf8'), '# User customization\n');
});

test('re-enables a previously excluded component', async () => {
  const root = await fixture();
  await initProject({ root, execute: true });
  await modifyProject({ root, component: 'workflow-skills', remove: true, execute: true });
  const added = await modifyProject({ root, component: 'workflow-skills' });
  assert.equal(added.components.includes('workflow-skills'), true);
  assert.equal(added.config.components.exclude.includes('workflow-skills'), false);
});

test('tracks and removes the optional Graphify adapter with its component', async () => {
  const root = await fixture();
  const initial = await projectPlan({ root });
  initial.config.tools.graphify.install = true;
  await applyProject(await projectPlan({ root, requestedConfig: initial.config }));
  const adapter = join(root, '.codex-kit', 'tools', 'setup-graphify-codex.mjs');
  assert.equal((await import('node:fs')).existsSync(adapter), true);
  const removed = await modifyProject({ root, component: 'graphify', remove: true, execute: true });
  assert.equal(removed.config.tools.graphify.install, false);
  assert.equal((await import('node:fs')).existsSync(adapter), false);
});

test('upgrades an unchanged Kit-owned skill while preserving ownership', async () => {
  const root = await fixture();
  await initProject({ root, execute: true });
  const stateFile = join(root, '.codex-kit', 'state.json');
  const state = JSON.parse(await readFile(stateFile, 'utf8'));
  const target = '.agents/skills/plan-with-subagents';
  const destination = join(root, target);
  await writeFile(join(destination, 'SKILL.md'), '# Simulated older bundled version\n');
  state.assets.find((asset) => asset.target === target).hash = await pathHash(destination);
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  const refreshed = await applyProject(await projectPlan({ root }));
  assert.equal(refreshed.status, 'ok');
  assert.match(await readFile(join(destination, 'SKILL.md'), 'utf8'), /^---\r?\nname: plan-with-subagents/m);
});

test('project commands require Git', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-no-git-'));
  await assert.rejects(() => initProject({ root }), /Git repository/);
});

test('personal preset provisions a portable Obsidian brain key and skill', async () => {
  const root = await fixture();
  assert.equal(run('git', ['-C', root, 'remote', 'add', 'origin', 'git@github.com:Example/Portable-Brain.git']).status, 0);
  const preview = await projectPlan({ root, preset: 'personal' });
  assert.equal(preview.components.includes('obsidian-brain'), true);
  assert.match(preview.config.tools.obsidian.projectKey, /^portable-brain-[a-f0-9]{10}$/);
  const applied = await applyProject(preview);
  assert.equal(applied.status, 'ok');
  assert.equal((await import('node:fs')).existsSync(join(root, '.agents', 'skills', 'obsidian-project-brain', 'SKILL.md')), true);
  const refreshed = await projectPlan({ root, preset: 'developer' });
  assert.equal(refreshed.config.tools.obsidian.projectKey, preview.config.tools.obsidian.projectKey);
});

test('empty repository previews a pending brain namespace and allocates it once on apply', async () => {
  const root = await fixture();
  const first = await projectPlan({ root, preset: 'personal' });
  const second = await projectPlan({ root, preset: 'personal' });
  assert.equal(first.config.tools.obsidian.projectKey, undefined);
  assert.equal(second.config.tools.obsidian.projectKey, undefined);
  const applied = await applyProject(first);
  assert.match(applied.config.tools.obsidian.projectKey, /^[a-z0-9-]+-[a-f0-9]{10}$/);
  const refreshed = await projectPlan({ root, preset: 'personal' });
  assert.equal(refreshed.config.tools.obsidian.projectKey, applied.config.tools.obsidian.projectKey);
});
