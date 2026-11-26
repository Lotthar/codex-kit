import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, rename, writeFile, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { contentSetup, contentStatus } from '../src/content.mjs';

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'content-test-'));
  const source = join(base, 'source');
  const home = join(base, 'codex');
  await mkdir(source);
  const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  for (const name of ['video-edit', 'video-motion', 'video-review', 'higgsfield-brandkit', 'higgsfield-creative-director', 'higgsfield-faceless-video', 'higgsfield-generate', 'higgsfield-marketplace-cards', 'higgsfield-product-photoshoot', 'higgsfield-soul-id', 'higgsfield-video-explainer', 'higgsfield-websites', 'higgsfield-youtube-thumbnail']) {
    const path = join(source, '.agents', 'skills', name);
    await mkdir(path, { recursive: true });
    await writeFile(join(path, 'SKILL.md'), `---\nname: ${name}\ndescription: test\n---\n`);
    if (name.startsWith('higgsfield-')) {
      await mkdir(join(path, 'agents'), { recursive: true });
      await writeFile(join(path, 'agents', 'openai.yaml'), 'policy:\n  allow_implicit_invocation: false\n');
    }
  }
  git('add', '.'); git('commit', '-qm', 'fixture');
  return { base, source, home, ref: git('rev-parse', 'HEAD'), git };
}

test('preview and install use committed content, preserve conflicts, and report status', async () => {
  const { base, source, home, ref } = await fixture();
  await writeFile(join(source, '.agents/skills/video-edit/SKILL.md'), 'dirty worktree');
  const args = { home, source, ref, userHome: base };
  assert.equal((await contentSetup(args)).status, 'ok');
  await assert.rejects(readFile(join(home, 'skills/video-edit/SKILL.md')));
  assert.equal((await contentSetup({ ...args, execute: true })).status, 'ok');
  assert.match(await readFile(join(home, 'skills/video-edit/SKILL.md'), 'utf8'), /name: video-edit/);
  assert.equal((await contentStatus({ home, userHome: base })).status, 'ok');
  await writeFile(join(home, 'skills/video-edit/SKILL.md'), 'user changes');
  const conflict = await contentSetup({ ...args, execute: true });
  assert.equal(conflict.status, 'conflict');
  assert.ok(!conflict.actions.some((item) => item.state === 'changed'));
  assert.equal(await readFile(join(home, 'skills/video-edit/SKILL.md'), 'utf8'), 'user changes');
  await assert.rejects(contentSetup({ ...args, ref: 'bad' }), /full 40-character/);
});

test('rejects a symlink in the committed skill tree', async () => {
  const { base, source, home, git } = await fixture();
  await symlink('/etc/passwd', join(source, '.agents/skills/video-edit/link'));
  git('add', '.'); git('commit', '-qm', 'symlink');
  await assert.rejects(contentSetup({ home, source, ref: git('rev-parse', 'HEAD'), userHome: base }), /unsafe path/);
});


test('replaces a receipt-owned legacy skill from the pinned source', async () => {
  const { base, source, home, ref } = await fixture();
  const name = 'higgsfield-generate';
  const directory = join(home, 'skills', name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'SKILL.md'), 'existing skill');
  const { pathHash } = await import('../src/transaction.mjs');
  await mkdir(join(home, '.codex-kit'), { recursive: true });
  await writeFile(join(home, '.codex-kit/global-assets.json'), JSON.stringify({ assets: [{ component: 'base-policy', source: `workflow-skills/${name}`, target: `skills/${name}`, hash: await pathHash(directory) }] }));
  const args = { home, source, ref, userHome: base, execute: true };
  assert.equal((await contentSetup(args)).status, 'ok');
  assert.match(await readFile(join(directory, 'SKILL.md'), 'utf8'), /name: higgsfield-generate/);
  assert.deepEqual(JSON.parse(await readFile(join(home, '.codex-kit/global-assets.json'), 'utf8')).assets, []);
  assert.equal((await contentStatus({ home, userHome: base })).status, 'ok');
  await contentSetup(args);
  assert.match(await readFile(join(directory, 'SKILL.md'), 'utf8'), /name: higgsfield-generate/);
  assert.equal((await contentStatus({ home, userHome: base })).status, 'ok');
});


test('completes ownership transfer when content receipt was already written', async () => {
  const { base, source, home, ref } = await fixture();
  const name = 'higgsfield-generate';
  const directory = join(home, 'skills', name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'SKILL.md'), 'existing skill');
  const { pathHash } = await import('../src/transaction.mjs');
  const hash = await pathHash(directory);
  await mkdir(join(home, '.codex-kit'), { recursive: true });
  await writeFile(join(home, '.codex-kit/content.json'), JSON.stringify({ source, ref, skills: { [name]: hash } }));
  await writeFile(join(home, '.codex-kit/global-assets.json'), JSON.stringify({ assets: [{ component: 'base-policy', source: `workflow-skills/${name}`, target: `skills/${name}`, hash }] }));
  await contentSetup({ home, source, ref, userHome: base, execute: true });
  assert.match(await readFile(join(directory, 'SKILL.md'), 'utf8'), /name: higgsfield-generate/);
  assert.deepEqual(JSON.parse(await readFile(join(home, '.codex-kit/global-assets.json'), 'utf8')).assets, []);
});

test('resumes a pending upgrade after each directory and receipt boundary', async () => {
  const { pathHash } = await import('../src/transaction.mjs');
  for (const point of ['old-live', 'old-moved', 'new-live', 'content-receipt']) {
    const { base, source, home, ref } = await fixture();
    const name = 'higgsfield-generate';
    const target = join(home, 'skills', name);
    const pending = join(home, '.codex-kit', 'content-pending');
    const stage = join(pending, 'stage');
    const backup = join(pending, 'backup');
    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'SKILL.md'), 'old skill');
    const beforeHash = await pathHash(target);
    await mkdir(pending, { recursive: true });
    await cp(join(source, '.agents', 'skills', name), stage, { recursive: true });
    const afterHash = await pathHash(stage);
    const legacyRow = { component: 'base-policy', source: 'workflow-skills/' + name,
      target: 'skills/' + name, hash: beforeHash };
    await writeFile(join(pending, 'intent.json'), JSON.stringify({
      schemaVersion: 1, source, ref, name, beforeHash, afterHash, legacyRow
    }));
    await writeFile(join(home, '.codex-kit', 'global-assets.json'), JSON.stringify({ assets: [legacyRow] }));
    if (point !== 'old-live') await rename(target, backup);
    if (point === 'new-live' || point === 'content-receipt') await rename(stage, target);
    if (point === 'content-receipt') await writeFile(join(home, '.codex-kit', 'content.json'),
      JSON.stringify({ source, ref, skills: { [name]: afterHash } }));
    const result = await contentSetup({ home, source, ref, userHome: base, execute: true });
    assert.equal(result.status, 'ok', point);
    assert.match(await readFile(join(target, 'SKILL.md'), 'utf8'), /name: higgsfield-generate/);
    assert.deepEqual(JSON.parse(await readFile(join(home, '.codex-kit', 'global-assets.json'), 'utf8')).assets, []);
    await assert.rejects(readFile(join(pending, 'intent.json')));
  }
});

test('ordinary global setup refuses a pending content upgrade', async () => {
  const { home } = await fixture();
  await mkdir(join(home, '.codex-kit', 'content-pending'), { recursive: true });
  const { applyGlobal, globalPlan } = await import('../src/global.mjs');
  await assert.rejects(applyGlobal(await globalPlan({ home, preset: 'minimal' })), /Resume pending content/);
});

test('historical rollback cannot delete or reassign a content-owned skill', async () => {
  const { source, home, ref } = await fixture();
  const { beginTransaction, copyTracked, finishTransaction, pathHash, rollbackTransaction, writeTracked } =
    await import('../src/transaction.mjs');
  await mkdir(join(home, 'skills'), { recursive: true });
  const transaction = await beginTransaction(home, 'global');
  const name = 'higgsfield-generate';
  const target = join(home, 'skills', name);
  await copyTracked(transaction, join(source, '.agents', 'skills', name), target);
  const receipt = await finishTransaction(transaction);
  await writeFile(join(home, '.codex-kit', 'content.json'), JSON.stringify({
    source, ref, skills: { [name]: await pathHash(target) }
  }));
  await assert.rejects(rollbackTransaction(home, receipt.id), /content-owned skill/);
  assert.match(await readFile(join(target, 'SKILL.md'), 'utf8'), /name: higgsfield-generate/);

  const oldRow = { component: 'base-policy', source: 'workflow-skills/' + name,
    target: 'skills/' + name, hash: await pathHash(target) };
  const globalPath = join(home, '.codex-kit', 'global-assets.json');
  await writeFile(globalPath, JSON.stringify({ assets: [oldRow] }));
  const next = await beginTransaction(home, 'global');
  await writeTracked(next, globalPath, JSON.stringify({ assets: [] }));
  const nextReceipt = await finishTransaction(next);
  await assert.rejects(rollbackTransaction(home, nextReceipt.id), /legacy ownership/);
});

test('pending upgrade preserves unexpected live changes for review', async () => {
  const { base, source, home, ref } = await fixture();
  const name = 'higgsfield-generate';
  const target = join(home, 'skills', name);
  const pending = join(home, '.codex-kit', 'content-pending');
  await mkdir(target, { recursive: true });
  await writeFile(join(target, 'SKILL.md'), 'user modification');
  await mkdir(pending, { recursive: true });
  await cp(join(source, '.agents', 'skills', name), join(pending, 'stage'), { recursive: true });
  const { pathHash } = await import('../src/transaction.mjs');
  await writeFile(join(pending, 'intent.json'), JSON.stringify({
    schemaVersion: 1, source, ref, name, beforeHash: 'a'.repeat(64),
    afterHash: await pathHash(join(pending, 'stage')), legacyRow: null
  }));
  await assert.rejects(contentSetup({ home, source, ref, userHome: base, execute: true }), /Pending live skill changed/);
  assert.equal(await readFile(join(target, 'SKILL.md'), 'utf8'), 'user modification');
});

test('accepts version-before-name frontmatter and enforces explicit provider policy', async () => {
  const { base, source, home, git } = await fixture();
  const skill = join(source, '.agents/skills/higgsfield-brandkit/SKILL.md');
  await writeFile(skill, '---\nversion: 1.0\nname: higgsfield-brandkit\ndescription: test\n---\n');
  git('add', '.'); git('commit', '-qm', 'frontmatter order');
  assert.equal((await contentSetup({ home, source, ref: git('rev-parse', 'HEAD'), userHome: base })).status, 'ok');
  await writeFile(join(source, '.agents/skills/higgsfield-brandkit/agents/openai.yaml'),
    'policy:\n  allow_implicit_invocation: true\n');
  git('add', '.'); git('commit', '-qm', 'unsafe policy');
  await assert.rejects(contentSetup({ home, source, ref: git('rev-parse', 'HEAD'), userHome: base }),
    /explicit-only/);
});

test('refuses a symlinked skills parent before installing', async () => {
  const { base, source, home, ref } = await fixture();
  const outside = join(base, 'outside');
  await mkdir(home, { recursive: true });
  await mkdir(outside, { recursive: true });
  await symlink(outside, join(home, 'skills'), 'dir');
  await assert.rejects(contentSetup({ home, source, ref, userHome: base, execute: true }),
    /Unsafe content directory/);
  await assert.rejects(readFile(join(outside, 'video-edit', 'SKILL.md')));
});

test('CLI upgrade reuses pinned source and previews optional tools without writes', async () => {
  const { base, source, home, ref, git } = await fixture();
  const cli = (...args) => JSON.parse(execFileSync(process.execPath,
    [fileURLToPath(new URL('../bin/codex-kit.mjs', import.meta.url)), 'content', ...args, '--home', home, '--json'],
    { encoding: 'utf8', env: { ...process.env, HOME: base } }));
  assert.equal(cli('setup', '--source', source, '--ref', ref, '--yes').status, 'ok');
  await writeFile(join(source, '.agents/skills/video-edit/SKILL.md'),
    '---\nname: video-edit\ndescription: updated\n---\n');
  await writeFile(join(source, 'package.json'), JSON.stringify({ dependencies: { hyperframes: '0.9.99' } }));
  await writeFile(join(source, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: {
    '': { dependencies: { hyperframes: '0.9.99' } },
    'node_modules/hyperframes': { version: '0.9.99', resolved: 'https://registry.npmjs.org/hyperframes/-/hyperframes-0.9.99.tgz',
      integrity: 'sha512-YWJjZA==' }
  } }));
  git('add', '.'); git('commit', '-qm', 'upgrade');
  const next = git('rev-parse', 'HEAD');
  const preview = cli('upgrade', '--ref', next, '--with-tools');
  assert.equal(preview.status, 'ok');
  assert.ok(preview.actions.some((item) => item.label === 'install HyperFrames' && item.state === 'planned'));
  assert.equal(cli('upgrade', '--ref', next, '--yes').status, 'ok');
  assert.match(await readFile(join(home, 'skills/video-edit/SKILL.md'), 'utf8'), /updated/);
  assert.equal(JSON.parse(await readFile(join(home, '.codex-kit/content.json'), 'utf8')).ref, next);
});

test('alternate user skill blocks duplicate installation', async () => {
  const { base, source, home, ref } = await fixture();
  const duplicate = join(base, '.agents', 'skills', 'video-edit');
  await mkdir(duplicate, { recursive: true });
  await writeFile(join(duplicate, 'SKILL.md'), 'user skill');
  const result = await contentSetup({ home, source, ref, userHome: base, execute: true });
  assert.equal(result.status, 'conflict');
  assert.ok(result.actions.some((item) => item.label === 'alternate video-edit' && item.state === 'conflict'));
  await assert.rejects(readFile(join(home, 'skills', 'video-edit', 'SKILL.md')));
});

test('status reports a symlinked skill as an unsafe conflict', async () => {
  const { base, source, home, ref } = await fixture();
  await contentSetup({ home, source, ref, userHome: base, execute: true });
  const skill = join(home, 'skills', 'video-edit');
  const saved = join(base, 'saved-video-edit');
  await rename(skill, saved);
  await symlink(saved, skill, 'dir');
  const status = await contentStatus({ home, userHome: base });
  assert.equal(status.status, 'partial');
  assert.ok(status.actions.some((item) => item.label === 'video-edit' &&
    item.state === 'conflict' && /Unsafe content skill path/.test(item.detail)));
});

test('rejects Windows-ambiguous paths in a committed skill tree', { skip: process.platform === 'win32' }, async () => {
  const { base, source, home, git } = await fixture();
  await writeFile(join(source, '.agents/skills/video-edit', '..\\escape'), 'unsafe');
  git('add', '.'); git('commit', '-qm', 'ambiguous path');
  await assert.rejects(contentSetup({ home, source, ref: git('rev-parse', 'HEAD'), userHome: base }),
    /unsafe path/);
});

test('reads the exact commit despite local Git replacement objects', async () => {
  const { base, source, home, ref, git } = await fixture();
  await writeFile(join(source, '.agents/skills/video-edit/SKILL.md'),
    '---\nname: video-edit\ndescription: replacement\n---\n');
  git('add', '.'); git('commit', '-qm', 'replacement');
  git('replace', ref, git('rev-parse', 'HEAD'));
  const result = await contentSetup({ home, source, ref, userHome: base, execute: true });
  assert.equal(result.status, 'ok');
  assert.doesNotMatch(await readFile(join(home, 'skills/video-edit/SKILL.md'), 'utf8'), /replacement/);
});
