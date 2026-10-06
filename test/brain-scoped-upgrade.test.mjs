import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyProject, projectPlan } from '../src/project.mjs';
import { pathHash } from '../src/transaction.mjs';
import { run } from '../src/util.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-scoped-upgrade-'));
  assert.equal(run('git', ['-C', root, 'init']).status, 0);
  await writeFile(join(root, 'package.json'), '{}');
  await writeFile(join(root, 'AGENTS.md'), '# Human instructions\n');
  return root;
}

test('Brain-scoped project upgrade preserves other owned assets and human instructions', async () => {
  const root = await fixture();
  let plan = await projectPlan({ root, preset: 'personal' });
  plan.config.components.include.push('graphify');
  plan.config.tools.graphify.install = true;
  await applyProject(await projectPlan({ root, requestedConfig: plan.config }));

  const graphTarget = join(root, '.codex-kit', 'tools', 'setup-graphify-codex.mjs');
  const brainTarget = join(root, '.agents', 'skills', 'obsidian-project-brain', 'SKILL.md');
  await writeFile(graphTarget, '// owned older Graphify asset\n');
  await writeFile(brainTarget, '# owned older Brain skill\n');
  const statePath = join(root, '.codex-kit', 'state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.assets.find((asset) => asset.target === '.codex-kit/tools/setup-graphify-codex.mjs').hash = await pathHash(graphTarget);
  state.assets.find((asset) => asset.target === '.agents/skills/obsidian-project-brain').hash = await pathHash(join(root, '.agents', 'skills', 'obsidian-project-brain'));
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  const graphHash = await pathHash(graphTarget);

  await applyProject(await projectPlan({ root, requestedConfig: plan.config }), { assetComponents: ['obsidian-brain'] });

  assert.equal(await pathHash(graphTarget), graphHash);
  assert.match(await readFile(graphTarget, 'utf8'), /owned older Graphify asset/);
  assert.doesNotMatch(await readFile(brainTarget, 'utf8'), /owned older Brain skill/);
  assert.match(await readFile(join(root, 'AGENTS.md'), 'utf8'), /# Human instructions/);
  const refreshed = JSON.parse(await readFile(statePath, 'utf8'));
  assert.equal(refreshed.assets.find((asset) => asset.target === '.codex-kit/tools/setup-graphify-codex.mjs').hash, graphHash);
});
