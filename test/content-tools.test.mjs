import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { contentTools } from '../src/content-tools.mjs';

test('previews and installs the exact pinned runtime in isolation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'content-tools-test-'));
  const source = join(root, 'source');
  const home = join(root, 'home');
  await mkdir(source);
  const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  await writeFile(join(source, 'package.json'), JSON.stringify({ dependencies: { hyperframes: '0.9.99' } }));
  await writeFile(join(source, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: {
    '': { dependencies: { hyperframes: '0.9.99' } },
    'node_modules/hyperframes': { version: '0.9.99', resolved: 'https://registry.npmjs.org/hyperframes/-/hyperframes-0.9.99.tgz', integrity: 'sha512-YWJjZA==' }
  } }));
  git('add', '.'); git('commit', '-qm', 'fixture');
  const ref = git('rev-parse', 'HEAD');
  const calls = [];
  const runner = (tool, args, options) => {
    calls.push({ tool, args, options });
    if (tool === 'npm' && args[0] === 'ci') {
      const dir = join(options.cwd, 'node_modules', 'hyperframes');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '0.9.99' }));
    }
    return { status: 0, stdout: 'v22.0.0' };
  };
  await writeFile(join(source, 'package.json'), JSON.stringify({ dependencies: { hyperframes: '0.0.0' } }));
  git('add', 'package.json'); git('commit', '-qm', 'replacement');
  const replacement = git('rev-parse', 'HEAD');
  git('replace', ref, replacement);
  const options = { home, source, ref, runner };
  assert.equal((await contentTools(options)).status, 'ok');
  for (const tool of ['ffmpeg', 'ffprobe']) {
    assert.deepEqual(calls.find((call) => call.tool === tool).args, ['-version']);
  }
  await assert.rejects(readFile(join(home, '.codex-kit/content-tools', ref, 'package.json')));
  assert.equal((await contentTools({ ...options, execute: true })).status, 'ok');
  assert.ok(calls.some((call) => call.tool === 'npm' && call.args.includes('--ignore-scripts') && call.options.env.HOME !== process.env.HOME));
  assert.equal((await contentTools({ ...options, execute: true })).status, 'ok');
  assert.equal(calls.filter((call) => call.tool === 'npm' && call.args[0] === 'ci').length, 1);
  await writeFile(join(home, '.codex-kit/content-tools', ref, 'package-lock.json'), '{}');
  assert.equal((await contentTools({ ...options, execute: true })).status, 'partial');
  const outside = join(root, 'outside');
  const unsafe = join(root, 'unsafe');
  await mkdir(outside); await mkdir(unsafe);
  await symlink(outside, join(unsafe, '.codex-kit'));
  await assert.rejects(contentTools({ ...options, home: unsafe, execute: true }), /Unsafe content tools path/);
  const dangling = join(root, 'dangling');
  await mkdir(join(dangling, '.codex-kit', 'content-tools'), { recursive: true });
  await symlink(join(root, 'missing'), join(dangling, '.codex-kit', 'content-tools', ref));
  await assert.rejects(contentTools({ ...options, home: dangling, execute: true }), /Unsafe content tools path/);
  await assert.rejects(contentTools({ ...options, ref: 'bad' }), /exact commit/);
});
