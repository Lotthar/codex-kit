import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { cp, lstat, mkdir, readFile, readlink, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { exists } from './util.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extractor = join(sourceRoot, 'src', 'rea-extract.py');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const sri = (value) => `sha512-${createHash('sha512').update(value).digest('base64')}`;
const exec = (command, args, options = {}) => new Promise((resolvePromise, reject) => execFile(command, args, options, (error, stdout, stderr) => error ? reject(Object.assign(error, { stdout, stderr })) : resolvePromise({ stdout, stderr })));

export const loadReaLock = () => JSON.parse(readFileSync(join(sourceRoot, 'catalog', 'rea.lock.json'), 'utf8'));

export async function rejectReaLinks(path) {
  for (let current = resolve(path); ; current = dirname(current)) {
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Refusing symlinked REA path: ${current}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (current === dirname(current)) return;
  }
}

function validateReaLock(lock) {
  const safeVersion = (version) => typeof version === 'string' && /^[A-Za-z0-9][A-Za-z0-9.+_-]*$/.test(version);
  if (lock?.lockVersion !== 1 || !safeVersion(lock.rea?.version) || lock.rea?.package !== 'rea-agents' || !lock.rea.url?.startsWith('https://') || !/^sha512-[A-Za-z0-9+/]+=*$/.test(lock.rea.integrity ?? '')) throw new Error('Unsupported REA lock format.');
  for (const name of ['node', 'java', 'ghidra', 'jadx']) {
    const artifact = lock.artifacts?.[name];
    if (!safeVersion(artifact?.version) || !artifact.url?.startsWith('https://') || !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? '')) throw new Error(`Invalid REA ${name} pin.`);
  }
  return lock;
}

async function noFollowHash(path, root = path, ignoreOwnerReceipt = false) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) {
    const target = await readlink(path);
    const resolved = resolve(dirname(path), target);
    if (isAbsolute(target) || relative(root, resolved).startsWith('..')) throw new Error(`REA toolchain link escapes its root: ${path}`);
    return sha256(`link:${target}`);
  }
  if (!info.isDirectory()) return sha256(`file:${info.mode & 0o777}:${sha256(await readFile(path))}`);
  const entries = await readdir(path, { withFileTypes: true });
  const parts = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (ignoreOwnerReceipt && path === root && entry.name === '.rea-toolchain.json') continue;
    parts.push(`${entry.name}:${await noFollowHash(join(path, entry.name), root, ignoreOwnerReceipt)}`);
  }
  return sha256(`dir:${info.mode & 0o777}:${parts.join('\n')}`);
}

export const reaTreeHash = noFollowHash;
const toolchainTreeHash = (path) => noFollowHash(path, path, true);

const toolchainId = (lock) => `${lock.rea.version}-${sha256(JSON.stringify(lock)).slice(0, 16)}`;

export function reaToolchainPaths(home, lock = loadReaLock()) {
  const root = join(resolve(home), '.codex-kit', 'rea', 'tools', toolchainId(lock));
  const node = join(root, 'node', 'bin', 'node');
  const npm = join(root, 'node', 'bin', 'npm');
  const packageRoot = join(root, 'npm', 'node_modules', lock.rea.package);
  const javaHome = join(root, 'java');
  const ghidraHome = join(root, 'ghidra');
  const jadxJar = join(root, 'jadx', 'jadx-headless-mcp.jar');
  return {
    root, node, npm, packageRoot,
    cli: join(packageRoot, 'scripts', 'rea.mjs'),
    skillSource: join(packageRoot, 'skills', 'reverse-engineer-anything'),
    javaHome, ghidraHome, jadxJar,
    env: { JAVA_HOME: javaHome, REA_JADX_MCP_JAR: jadxJar, GHIDRA_INSTALL_DIR: ghidraHome, PATH: `${join(root, 'node', 'bin')}:${join(javaHome, 'bin')}:${process.env.PATH ?? ''}` }
  };
}

export async function reaToolchainPlan({ home }) {
  const lock = validateReaLock(loadReaLock());
  const paths = reaToolchainPaths(home, lock);
  return { version: lock.rea.version, paths, artifacts: [{ name: 'rea', ...lock.rea }, ...Object.entries(lock.artifacts).map(([name, artifact]) => ({ name, ...artifact }))] };
}

async function ensurePlainDirectory(path) {
  try { if ((await lstat(path)).isSymbolicLink()) throw new Error(`Refusing symlinked REA path: ${path}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(path, { recursive: true });
}

async function downloadArtifact({ name, url, expected, cache, allowNetwork, download }) {
  await rejectReaLinks(cache);
  if (exists(cache)) {
    const body = await readFile(cache);
    if (expected(body)) return { path: cache, cached: true };
    throw new Error(`Cached ${name} digest does not match the REA lock.`);
  }
  if (!allowNetwork) throw new Error(`REA ${name} is not cached and network access is disabled.`);
  const body = await download(url, name);
  if (!Buffer.isBuffer(body)) throw new Error(`REA ${name} download did not return bytes.`);
  if (!expected(body)) throw new Error(`Downloaded ${name} digest does not match the REA lock.`);
  await writeFile(cache, body, { flag: 'wx' });
  return { path: cache, cached: false };
}

const exactOneDirectory = async (path, label) => {
  const entries = await readdir(path, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  if (directories.length !== 1 || entries.length !== 1) throw new Error(`Unexpected ${label} archive layout.`);
  return join(path, directories[0].name);
};

async function extractArchive(archive, destination, label, run) {
  await run('python3', [extractor, archive, destination]);
  return exactOneDirectory(destination, label);
}

async function assertPython(run, version = undefined) {
  const result = version === undefined ? await run('python3', ['--version']) : null;
  const output = version ?? `${result?.stdout ?? ''}${result?.stderr ?? ''}`;
  const match = /Python\s+(\d+)\.(\d+)/.exec(output);
  if (!match || Number(match[1]) < 3 || (Number(match[1]) === 3 && Number(match[2]) < 12)) throw new Error('REA extraction requires Python 3.12 or newer.');
}

export async function provisionReaToolchain({ home, allowNetwork = false, lock: suppliedLock = loadReaLock(), pythonVersion, download = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`REA download failed: ${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}, run = exec, platform = process.platform, arch = process.arch } = {}) {
  if (platform !== 'linux' || arch !== 'x64') throw new Error('REA private toolchain supports Linux x64 only.');
  if (!home) throw new Error('REA toolchain requires a Codex home directory.');
  const lock = validateReaLock(suppliedLock);
  await assertPython(run, pythonVersion);
  const paths = reaToolchainPaths(home, lock);
  const toolsRoot = dirname(paths.root);
  const ownerPath = join(paths.root, '.rea-toolchain.json');
  const cacheRoot = join(resolve(home), '.codex-kit', 'rea', 'cache');
  await rejectReaLinks(paths.root);
  await rejectReaLinks(cacheRoot);
  if (exists(paths.root)) {
    if ((await lstat(paths.root)).isSymbolicLink() || (await lstat(ownerPath)).isSymbolicLink()) throw new Error(`Refusing symlinked REA toolchain: ${paths.root}`);
    const owner = JSON.parse(await readFile(ownerPath, 'utf8').catch(() => { throw new Error(`Refusing existing unowned REA toolchain: ${paths.root}`); }));
    if (owner.lockHash !== sha256(JSON.stringify(lock)) || owner.treeHash !== await toolchainTreeHash(paths.root)) throw new Error(`Refusing modified REA toolchain: ${paths.root}`);
    return { paths, version: lock.rea.version, artifacts: owner.artifacts, status: 'existing' };
  }
  await ensurePlainDirectory(toolsRoot);
  await ensurePlainDirectory(cacheRoot);
  const stage = `${paths.root}.stage-${process.pid}-${Date.now()}`;
  const artifacts = [];
  try {
    await mkdir(stage, { recursive: false });
    const obtain = async (name, artifact, expected, extension) => {
      const result = await downloadArtifact({ name, url: artifact.url, expected, cache: join(cacheRoot, `${name}-${artifact.version ?? lock.rea.version}${extension}`), allowNetwork, download });
      artifacts.push({ name, version: artifact.version ?? lock.rea.version, url: artifact.url, digest: artifact.sha256 ?? artifact.integrity, cached: result.cached, file: result.path });
      return result.path;
    };
    const nodeArchive = await obtain('node', lock.artifacts.node, (body) => sha256(body) === lock.artifacts.node.sha256, '.tar.xz');
    const javaArchive = await obtain('java', lock.artifacts.java, (body) => sha256(body) === lock.artifacts.java.sha256, '.tar.gz');
    const ghidraArchive = await obtain('ghidra', lock.artifacts.ghidra, (body) => sha256(body) === lock.artifacts.ghidra.sha256, '.zip');
    const reaArchive = await obtain('rea', lock.rea, (body) => sri(body) === lock.rea.integrity, '.tgz');
    const jadxJar = await obtain('jadx', lock.artifacts.jadx, (body) => sha256(body) === lock.artifacts.jadx.sha256, '.jar');
    const unpack = async (archive, target, label) => {
      const temporary = `${target}.extract`;
      await mkdir(temporary, { recursive: true });
      const extracted = await extractArchive(archive, temporary, label, run);
      await rename(extracted, target);
      await rm(temporary, { recursive: true, force: true });
    };
    await unpack(nodeArchive, join(stage, 'node'), 'Node');
    await unpack(javaArchive, join(stage, 'java'), 'Java');
    await unpack(ghidraArchive, join(stage, 'ghidra'), 'Ghidra');
    await mkdir(join(stage, 'jadx'), { recursive: true });
    await cp(jadxJar, join(stage, 'jadx', 'jadx-headless-mcp.jar'), { force: false });
    const npm = join(stage, 'node', 'bin', 'npm');
    await run(npm, ['install', '--prefix', join(stage, 'npm'), '--cache', join(cacheRoot, 'npm'), '--ignore-scripts', '--no-audit', '--no-fund', ...(!allowNetwork ? ['--offline'] : []), reaArchive], { env: { ...process.env, PATH: `${join(stage, 'node', 'bin')}:${process.env.PATH ?? ''}` } });
    const stagedPaths = reaToolchainPaths(home, lock);
    const relativeRoot = join(stage, 'npm', 'node_modules', lock.rea.package);
    for (const expected of [join(relativeRoot, 'scripts', 'rea.mjs'), join(relativeRoot, 'skills', 'reverse-engineer-anything')]) if (!exists(expected)) throw new Error(`REA package is missing required path: ${expected}`);
    const owner = { lockHash: sha256(JSON.stringify(lock)), artifacts, createdAt: new Date().toISOString(), treeHash: await toolchainTreeHash(stage) };
    await writeFile(join(stage, '.rea-toolchain.json'), JSON.stringify(owner));
    await rename(stage, paths.root);
    return { paths: stagedPaths, version: lock.rea.version, artifacts, status: 'installed' };
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
}
