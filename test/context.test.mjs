import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contextStatus } from '../src/context.mjs';

const globalBlock = '<!-- codex-kit:global:start -->\nmanaged\n<!-- codex-kit:global:end -->';
const projectBlock = '<!-- codex-kit:project:start -->\nmanaged\n<!-- codex-kit:project:end -->';

test('reports AGENTS byte accounting and the compact Brain budget', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-context-root-'));
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-context-home-'));
  await writeFile(join(root, 'AGENTS.md'), `human\n${projectBlock}\n`);
  await writeFile(join(home, 'AGENTS.md'), `human\n${globalBlock}\n`);
  const result = await contextStatus({ root, home });
  assert.equal(result.status, 'ok');
  assert.equal(result.global.humanBytes, Buffer.byteLength('human\n\n', 'utf8'));
  assert.equal(result.project.humanBytes, Buffer.byteLength('human\n\n', 'utf8'));
  assert.equal(result.knownStaticBytes, result.global.totalBytes + result.project.totalBytes);
  assert.equal(result.kitManagedStaticBytes, result.global.kitManagedBytes + result.project.kitManagedBytes);
  assert.equal(result.brainRecallBudgetBytes, 4096);
});

test('counts only tracked Kit skill targets when reporting duplicates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-context-root-'));
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-context-home-'));
  await mkdir(join(root, '.codex-kit'), { recursive: true });
  await mkdir(join(home, '.codex-kit'), { recursive: true });
  await mkdir(join(root, '.agents', 'skills', 'obsidian-project-brain'), { recursive: true });
  await mkdir(join(home, 'skills', 'obsidian-project-brain'), { recursive: true });
  await mkdir(join(root, '.agents', 'skills', 'untracked'), { recursive: true });
  await writeFile(join(root, '.agents', 'skills', 'obsidian-project-brain', 'SKILL.md'), '---\nname: shared\n---\n');
  await writeFile(join(home, 'skills', 'obsidian-project-brain', 'SKILL.md'), '---\nname: shared\n---\n');
  await writeFile(join(root, '.agents', 'skills', 'untracked', 'SKILL.md'), '---\nname: shared\n---\n');
  await writeFile(join(root, '.codex-kit', 'state.json'), JSON.stringify({ assets: [{ target: '.agents/skills/obsidian-project-brain' }, { target: '.agents/skills/untracked' }, { target: '../outside' }] }));
  await writeFile(join(home, '.codex-kit', 'global-assets.json'), JSON.stringify({ assets: [{ target: 'skills/obsidian-project-brain' }, { target: 'skills/untracked' }] }));
  const result = await contextStatus({ root, home });
  assert.deepEqual(result.duplicateSkills, [{
    name: 'shared',
    paths: [
      { path: join(home, 'skills', 'obsidian-project-brain', 'SKILL.md'), scope: 'global' },
      { path: join(root, '.agents', 'skills', 'obsidian-project-brain', 'SKILL.md'), scope: 'project' }
    ]
  }]);
});

test('treats missing and platform-shaped paths as empty without traversing state targets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-context-root-'));
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-context-home-'));
  await mkdir(join(root, '.codex-kit'), { recursive: true });
  await writeFile(join(root, '.codex-kit', 'state.json'), JSON.stringify({ assets: [{ target: 'C:\\outside' }, { target: '..\\outside' }] }));
  const result = await contextStatus({ root, home });
  assert.equal(result.global.exists, false);
  assert.equal(result.project.exists, false);
  assert.deepEqual(result.duplicateSkills, []);
});

test('context status CLI renders both concise text and machine-readable accounting for absent paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-context-cli-root-'));
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-context-cli-home-'));
  const command = [join(process.cwd(), 'bin', 'codex-kit.mjs'), 'context', 'status', '--root', root, '--home', home];

  const text = execFileSync(process.execPath, command, { encoding: 'utf8' });
  const json = JSON.parse(execFileSync(process.execPath, [...command, '--json'], { encoding: 'utf8' }));

  assert.match(text, /^OK$/m);
  assert.match(text, /global AGENTS context/);
  assert.match(text, /Brain recall budget.*4096 bytes/);
  assert.equal(json.status, 'ok');
  assert.equal(json.global.exists, false);
  assert.equal(json.project.exists, false);
  assert.equal(json.knownStaticBytes, 0);
  assert.equal(json.kitManagedStaticBytes, 0);
  assert.equal(json.brainRecallBudgetBytes, 4096);
  assert.deepEqual(json.duplicateSkills, []);
});
