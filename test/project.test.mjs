import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initProject, projectDiff, projectPlan, rollbackProject } from '../src/project.mjs';
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
  const diff = await projectDiff(await projectPlan({ root }));
  assert.ok(typeof diff.diff === 'string');
  await rollbackProject(root, applied.transactionId);
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), '# Human rules\n\nAfter stays.\n');
});

test('project commands require Git', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-no-git-'));
  await assert.rejects(() => initProject({ root }), /Git repository/);
});
