import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { provisionReaToolchain, reaToolchainPaths } from '../src/rea-toolchain.mjs';

const execFile = promisify(execFileCallback);
const sha256 = (body) => createHash('sha256').update(body).digest('hex');
const sri = (body) => `sha512-${createHash('sha512').update(body).digest('base64')}`;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-rea-toolchain-'));
  const home = join(root, 'home');
  await mkdir(home);
  return { root, home };
}

function fixtureLock() {
  const files = { node: Buffer.from('node'), java: Buffer.from('java'), ghidra: Buffer.from('ghidra'), rea: Buffer.from('rea'), jadx: Buffer.from('jadx') };
  return {
    files,
    lock: {
      lockVersion: 1,
      rea: { version: '6.4.0-test', package: 'rea-agents', url: 'https://fixtures.invalid/rea.tgz', integrity: sri(files.rea) },
      artifacts: Object.fromEntries(['node', 'java', 'ghidra', 'jadx'].map((name) => [name, { version: `${name}-test`, url: `https://fixtures.invalid/${name}`, sha256: sha256(files[name]) }]))
    }
  };
}

function fakeRun(lock, calls = []) {
  return async (command, args) => {
    calls.push({ command, args });
    if (command === 'python3') {
      const destination = args[2];
      const name = args[1].includes('node-') ? 'node' : args[1].includes('java-') ? 'java' : 'ghidra';
      const extracted = join(destination, `${name}-root`);
      await mkdir(extracted, { recursive: true });
      if (name === 'node') await writeFile(join(extracted, 'bin', 'npm'), '#!/bin/sh\n').catch(async () => {
        await mkdir(join(extracted, 'bin'), { recursive: true });
        await writeFile(join(extracted, 'bin', 'npm'), '#!/bin/sh\n');
      });
      if (name === 'node') await writeFile(join(extracted, 'bin', 'node'), '#!/bin/sh\n');
      if (name === 'node') await chmod(join(extracted, 'bin', 'node'), 0o755);
      return { stdout: '' };
    }
    if (args[0] === 'install') {
      const prefix = args[args.indexOf('--prefix') + 1];
      const packageRoot = join(prefix, 'node_modules', lock.rea.package);
      await mkdir(join(packageRoot, 'scripts'), { recursive: true });
      await mkdir(join(packageRoot, 'skills', 'reverse-engineer-anything'), { recursive: true });
      await writeFile(join(packageRoot, 'scripts', 'rea.mjs'), 'export {};\n');
      await writeFile(join(packageRoot, 'skills', 'reverse-engineer-anything', 'SKILL.md'), '# REA\n');
      return { stdout: '' };
    }
    throw new Error(`Unexpected command: ${command}`);
  };
}

async function cacheAll(home, lock, files, { nodeSymlink = false } = {}) {
  const cache = join(home, '.codex-kit', 'rea', 'cache');
  await mkdir(cache, { recursive: true });
  const entries = [
    ['node', lock.artifacts.node.version, '.tar.xz'], ['java', lock.artifacts.java.version, '.tar.gz'], ['ghidra', lock.artifacts.ghidra.version, '.zip'], ['rea', lock.rea.version, '.tgz'], ['jadx', lock.artifacts.jadx.version, '.jar']
  ];
  for (const [name, version, extension] of entries) {
    const path = join(cache, `${name}-${version}${extension}`);
    if (name === 'node' && nodeSymlink) {
      const outside = join(home, 'outside-node');
      await writeFile(outside, files.node);
      await symlink(outside, path);
    } else await writeFile(path, files[name]);
  }
}

test('checksum mismatch fails before extraction or registration', async () => {
  const { home } = await fixture();
  const { lock } = fixtureLock();
  const calls = [];
  let downloads = 0;
  await assert.rejects(() => provisionReaToolchain({ home, lock, allowNetwork: true, pythonVersion: 'Python 3.12.0', run: fakeRun(lock, calls), download: async () => { downloads += 1; return Buffer.from('wrong'); } }), /Downloaded node digest/);
  assert.equal(downloads, 1);
  assert.deepEqual(calls, []);
  assert.equal(existsSync(reaToolchainPaths(home, lock).root), false);
});

test('mismatched cached artifact fails without download or extraction', async () => {
  const { home } = await fixture();
  const { lock } = fixtureLock();
  const cache = join(home, '.codex-kit', 'rea', 'cache');
  await mkdir(cache, { recursive: true });
  await writeFile(join(cache, `node-${lock.artifacts.node.version}.tar.xz`), 'tampered');
  let downloaded = false;
  const calls = [];
  await assert.rejects(() => provisionReaToolchain({ home, lock, allowNetwork: true, pythonVersion: 'Python 3.12.0', run: fakeRun(lock, calls), download: async () => { downloaded = true; return Buffer.from('node'); } }), /Cached node digest/);
  assert.equal(downloaded, false);
  assert.deepEqual(calls, []);
});

test('unsupported platforms do not create files or invoke download', async () => {
  const { home } = await fixture();
  const { lock } = fixtureLock();
  let downloaded = false;
  await assert.rejects(() => provisionReaToolchain({ home, lock, allowNetwork: true, platform: 'darwin', arch: 'arm64', download: async () => { downloaded = true; return Buffer.alloc(0); } }), /Linux x64/);
  assert.equal(downloaded, false);
  assert.equal(existsSync(join(home, '.codex-kit')), false);
});

test('lock version labels cannot escape private cache or installation paths', async () => {
  const { home } = await fixture();
  const { lock } = fixtureLock();
  lock.artifacts.node.version = '../../outside';
  await assert.rejects(() => provisionReaToolchain({ home, lock, allowNetwork: true }), /Invalid REA node pin/);
  assert.equal(existsSync(join(home, '.codex-kit')), false);
});

test('a matching owned toolchain is reused offline without download or extraction', async () => {
  const { home } = await fixture();
  const { lock, files } = fixtureLock();
  const calls = [];
  const download = async (_url, name) => files[name];
  const installed = await provisionReaToolchain({ home, lock, allowNetwork: true, pythonVersion: 'Python 3.12.0', run: fakeRun(lock, calls), download });
  const before = calls.length;
  const reused = await provisionReaToolchain({ home, lock, allowNetwork: false, pythonVersion: 'Python 3.12.0', run: fakeRun(lock, calls), download: async () => { throw new Error('must stay offline'); } });
  assert.equal(installed.status, 'installed');
  assert.equal(reused.status, 'existing');
  assert.equal(calls.length, before);
});

test('installing from cached artifacts also keeps npm offline without network consent', async () => {
  const { home } = await fixture();
  const { lock, files } = fixtureLock();
  await cacheAll(home, lock, files);
  const calls = [];
  await provisionReaToolchain({ home, lock, allowNetwork: false, pythonVersion: 'Python 3.12.0', run: fakeRun(lock, calls), download: async () => { throw new Error('must stay offline'); } });
  const install = calls.find(({ args }) => args[0] === 'install');
  assert.equal(install.args.includes('--offline'), true);
});

test('changing a toolchain executable mode invalidates offline ownership reuse', async () => {
  const { home } = await fixture();
  const { lock, files } = fixtureLock();
  const paths = reaToolchainPaths(home, lock);
  await provisionReaToolchain({ home, lock, allowNetwork: true, pythonVersion: 'Python 3.12.0', run: fakeRun(lock), download: async (_url, name) => files[name] });
  await chmod(paths.node, 0o644);
  await assert.rejects(() => provisionReaToolchain({ home, lock, allowNetwork: false, pythonVersion: 'Python 3.12.0', run: fakeRun(lock), download: async () => { throw new Error('must stay offline'); } }), /modified REA toolchain/);
});

test('cached artifacts and toolchain ancestors reject symlinks', async (t) => {
  await t.test('cached artifact', async () => {
    const { home } = await fixture();
    const { lock, files } = fixtureLock();
    await cacheAll(home, lock, files, { nodeSymlink: true });
    await assert.rejects(() => provisionReaToolchain({ home, lock, allowNetwork: false, pythonVersion: 'Python 3.12.0', run: fakeRun(lock) }), /symlink/i);
  });

  await t.test('toolchain ancestor', async () => {
    const { root, home } = await fixture();
    const { lock } = fixtureLock();
    const outside = join(root, 'outside');
    await mkdir(outside);
    await mkdir(join(home, '.codex-kit'));
    await symlink(outside, join(home, '.codex-kit', 'rea'));
    await assert.rejects(() => provisionReaToolchain({ home, lock, allowNetwork: false, pythonVersion: 'Python 3.12.0', run: fakeRun(lock) }), /symlink/i);
    assert.equal((await lstat(join(home, '.codex-kit', 'rea'))).isSymbolicLink(), true);
  });
});

test('safe extractor rejects archive paths that escape its destination', async () => {
  const { root } = await fixture();
  const archive = join(root, 'escape.zip');
  const output = join(root, 'output');
  await execFile('python3', ['-c', "import sys, zipfile\nwith zipfile.ZipFile(sys.argv[1], 'w') as z: z.writestr('../escape', 'no')", archive]);
  await assert.rejects(() => execFile('python3', [new URL('../src/rea-extract.py', import.meta.url).pathname, archive, output]), /archive member escapes destination/);
  assert.equal(existsSync(join(root, 'escape')), false);
});
