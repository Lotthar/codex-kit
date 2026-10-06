import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyGlobal, globalPlan, safeExport, setAllowlistedConfig } from '../src/global.mjs';

test('exports reviewed portable content only when requested', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-export-v2-'));
  await writeFile(join(root, 'AGENTS.md'), '# Safe');
  const plain = await safeExport(root);
  assert.equal('content' in plain.artifacts[0], false);
  const reviewed = await safeExport(root, undefined, true);
  assert.equal(reviewed.artifacts[0].content, '# Safe');
});

test('writes strict allowlisted config transactionally', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-config-v2-'));
  await setAllowlistedConfig({ home: root, section: 'features', key: 'example', value: 'true' });
  assert.match(await readFile(join(root, 'config.toml'), 'utf8'), /example = true/);
});

test('personal setup installs the global brain skill and optional native memories', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-global-brain-'));
  await writeFile(join(home, 'AGENTS.md'), '# Human global rules\n');
  const result = await applyGlobal(await globalPlan({ home, preset: 'personal', memories: true }));
  assert.equal(result.status, 'ok');
  assert.match(await readFile(join(home, 'AGENTS.md'), 'utf8'), /# Human global rules/);
  const agents = await readFile(join(home, 'AGENTS.md'), 'utf8');
  assert.match(agents, /obsidian-brain/);
  assert.match(agents, /narrowly approved official desktop\/Obsidian CLI access/);
  assert.match(agents, /uses `\$obsidian-project-brain` once before decisions/);
  assert.match(agents, /Stable personal preferences require explicit user approval/);
  assert.match(agents, /two proven successful uses/);
  assert.match(agents, /remembered: true/);
  assert.match(agents, /--scope related/);
  assert.match(agents, /excluded and pending projects/);
  assert.match(agents, /Check `indexed` separately/);
  assert.match(await readFile(join(home, 'config.toml'), 'utf8'), /memories = true/);
  const skill = await readFile(join(home, 'skills', 'obsidian-project-brain', 'SKILL.md'), 'utf8');
  assert.match(skill, /name: obsidian-project-brain/);
  assert.match(skill, /narrowly approved desktop access/);
  assert.match(skill, /Once per non-trivial work task/);
  assert.match(skill, /Personal preferences require explicit approval in native memory/);
  assert.match(skill, /The decision is mandatory; creating a note is not/);
  assert.match(skill, /remembered: true/);
});

test('global brain setup preserves a colliding user-owned skill', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-global-brain-collision-'));
  const skill = join(home, 'skills', 'obsidian-project-brain', 'SKILL.md');
  await mkdir(join(home, 'skills', 'obsidian-project-brain'), { recursive: true });
  await writeFile(skill, '# User-owned brain\n');
  const result = await applyGlobal(await globalPlan({ home, preset: 'personal' }));
  assert.equal(result.status, 'partial');
  assert.equal(await readFile(skill, 'utf8'), '# User-owned brain\n');
});

test('switching away from personal removes only an unchanged Kit-owned global skill', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-global-brain-remove-'));
  await applyGlobal(await globalPlan({ home, preset: 'personal' }));
  const skill = join(home, 'skills', 'obsidian-project-brain');
  assert.equal((await import('node:fs')).existsSync(skill), true);
  await applyGlobal(await globalPlan({ home, preset: 'developer' }));
  assert.equal((await import('node:fs')).existsSync(skill), false);
});
