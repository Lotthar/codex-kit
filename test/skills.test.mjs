import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importSkill } from '../src/skills.mjs';

test('imports one portable skill with provenance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-skill-project-'));
  const sourceRoot = await mkdtemp(join(tmpdir(), 'codex-kit-skill-source-'));
  await writeFile(join(root, 'package.json'), '{}');
  await mkdir(join(sourceRoot, 'safe-skill'));
  await writeFile(join(sourceRoot, 'safe-skill', 'SKILL.md'), '# Safe');
  const result = await importSkill({ root, sourceRoot, name: 'safe-skill', execute: true });
  assert.equal(result.applied, true);
  await access(join(root, '.agents', 'skills', 'safe-skill', 'SKILL.md'));
});
