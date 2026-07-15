import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importSkill } from '../src/skills.mjs';

async function project() {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-skill-project-'));
  const result = (await import('../src/util.mjs')).run('git', ['-C', root, 'init']);
  assert.equal(result.status, 0);
  return root;
}

test('imports a portable skill only after explicit execution', async () => {
  const root = await project();
  const sourceRoot = await mkdtemp(join(tmpdir(), 'codex-kit-skill-source-'));
  await mkdir(join(sourceRoot, 'safe-skill'));
  await writeFile(join(sourceRoot, 'safe-skill', 'SKILL.md'), '# Safe');
  const preview = await importSkill({ root, sourceRoot, name: 'safe-skill' });
  assert.equal(preview.actions[0].state, 'planned');
  const applied = await importSkill({ root, sourceRoot, name: 'safe-skill', execute: true });
  assert.equal(applied.actions[0].state, 'changed');
});

test('rejects sensitive files and links', async () => {
  const root = await project();
  const sourceRoot = await mkdtemp(join(tmpdir(), 'codex-kit-skill-source-'));
  await mkdir(join(sourceRoot, 'unsafe'));
  await writeFile(join(sourceRoot, 'unsafe', 'SKILL.md'), '# Unsafe');
  await writeFile(join(sourceRoot, 'unsafe', '.env'), 'secret');
  await assert.rejects(() => importSkill({ root, sourceRoot, name: 'unsafe' }), /sensitive/);
  await mkdir(join(sourceRoot, 'linked'));
  await writeFile(join(sourceRoot, 'linked', 'SKILL.md'), '# Linked');
  await symlink(join(sourceRoot, 'unsafe', 'SKILL.md'), join(sourceRoot, 'linked', 'other.md'));
  await assert.rejects(() => importSkill({ root, sourceRoot, name: 'linked' }), /Symlinks|portable/);
});
