import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brainRepair } from '../src/brain-repair.mjs';

test('requires a preview hash before replacing a divergent Brain skill', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-brain-repair-'));
  const skill = join(home, 'skills', 'obsidian-project-brain', 'SKILL.md');
  await mkdir(join(home, 'skills', 'obsidian-project-brain'), { recursive: true });
  await writeFile(skill, '# customized\n');
  const preview = await brainRepair({ home });
  assert.equal(preview.ownership, 'unmanaged-divergent');
  assert.equal((await brainRepair({ home, execute: true })).status, 'partial');
  const applied = await brainRepair({ home, execute: true, expectedHash: preview.installedHash });
  assert.equal(applied.status, 'ok');
  assert.match(await readFile(skill, 'utf8'), /name: obsidian-project-brain/);
  const state = JSON.parse(await readFile(join(home, '.codex-kit', 'global-assets.json'), 'utf8'));
  assert.equal(state.assets[0].target, 'skills/obsidian-project-brain');
});

test('adopts a matching unowned Brain skill without replacing it', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-brain-adopt-'));
  const preview = await brainRepair({ home });
  await mkdir(join(home, 'skills'), { recursive: true });
  const source = join(process.cwd(), 'workflow-skills', 'obsidian-project-brain');
  await (await import('node:fs/promises')).cp(source, join(home, 'skills', 'obsidian-project-brain'), { recursive: true });
  const matching = await brainRepair({ home });
  assert.equal(matching.ownership, 'unmanaged-current');
  const applied = await brainRepair({ home, execute: true });
  assert.equal(applied.status, 'ok');
  assert.notEqual(preview.sourceHash, null);
});
