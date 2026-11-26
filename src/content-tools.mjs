import spawn from 'cross-spawn';
import { lstat, mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, parse, resolve } from 'node:path';
import { action } from './util.mjs';
import { withLock } from './transaction.mjs';

function git(source, args) {
  const result = spawn.sync('git', ['-C', source, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' } });
  if (result.status !== 0) throw new Error('Cannot read pinned content source: ' + result.stderr.trim());
  return result.stdout;
}

async function safeAncestors(path) {
  const parts = [];
  for (let current = resolve(path); current !== parse(current).root; current = dirname(current)) parts.unshift(current);
  for (const part of parts) {
    try {
      const stat = await lstat(part);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Unsafe content tools path: ' + part);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

async function matchesInstall(destination, files) {
  try {
    const [manifest, lock, installed] = await Promise.all([
      readFile(join(destination, 'package.json'), 'utf8'),
      readFile(join(destination, 'package-lock.json'), 'utf8'),
      readFile(join(destination, 'node_modules', 'hyperframes', 'package.json'), 'utf8')
    ]);
    return manifest === files[0] && lock === files[1] && JSON.parse(installed).version === '0.9.99';
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return false;
    throw error;
  }
}

export async function contentTools({ home, source, ref, execute = false, runner = spawn.sync }) {
  source = resolve(source);
  if (!/^[a-f0-9]{40}$/.test(ref || '') || git(source, ['rev-parse', '--verify', ref + '^{commit}']).trim() !== ref) throw new Error('Content tools require an exact commit.');
  const files = ['package.json', 'package-lock.json'].map((file) => {
    if (!/^100644 blob [a-f0-9]{40}\s/.test(git(source, ['ls-tree', ref, '--', file]))) throw new Error('Unsafe or missing ' + file);
    return git(source, ['show', ref + ':' + file]);
  });
  const manifest = JSON.parse(files[0]);
  const lock = JSON.parse(files[1]);
  const hyperframes = lock.packages?.['node_modules/hyperframes'];
  if (manifest.dependencies?.hyperframes !== '0.9.99' || lock.lockfileVersion !== 3 ||
      lock.packages?.['']?.dependencies?.hyperframes !== '0.9.99' || hyperframes?.version !== '0.9.99' ||
      !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(hyperframes.integrity || '')) throw new Error('Invalid HyperFrames version or lock integrity.');
  for (const [name, item] of Object.entries(lock.packages)) {
    if (!name) continue;
    if (item.link || !/^https:\/\/registry\.npmjs\.org\//.test(item.resolved || '') ||
        !/^sha(512|256)-[A-Za-z0-9+/]+={0,2}$/.test(item.integrity || '')) throw new Error('Unsafe lock entry: ' + name);
  }
  const actions = [];
  for (const tool of ['node', 'npm', 'ffmpeg', 'ffprobe']) {
    const result = runner(tool, [tool === 'ffmpeg' || tool === 'ffprobe' ? '-version' : '--version'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
    const ok = result.status === 0 && (tool !== 'node' || Number(result.stdout?.match(/v?(\d+)/)?.[1]) >= 22);
    actions.push(action(ok ? 'ready' : 'warning', tool, ok ? 'available' : 'missing or unsupported'));
  }
  const chrome = ['google-chrome', 'chromium', 'chromium-browser'].some((tool) => runner(tool, ['--version'], { encoding: 'utf8', env: { PATH: process.env.PATH } }).status === 0);
  actions.push(action(chrome ? 'ready' : 'warning', 'Chrome', chrome ? 'system browser available' : 'system browser not found; HyperFrames-managed browser not checked'));
  const destination = join(home, '.codex-kit', 'content-tools', ref);
  await safeAncestors(destination);
  if (!execute) return { status: 'ok', destination, actions: [...actions, action('planned', 'install HyperFrames', 'npm ci --ignore-scripts')] };
  if (actions.some((item) => item.state === 'warning' && item.label !== 'Chrome')) return { status: 'partial', destination, actions };
  return withLock(home, async () => {
    await safeAncestors(destination);
    let present = false;
    try { await lstat(destination); present = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (present) {
      const matching = await matchesInstall(destination, files);
      return { status: matching ? 'ok' : 'partial', destination, actions: [...actions,
        action(matching ? 'unchanged' : 'conflict', 'install HyperFrames', matching ? 'pinned runtime already installed' : 'destination differs; preserved')] };
    }
    const parent = join(home, '.codex-kit', 'content-tools');
    await mkdir(parent, { recursive: true });
    const stage = await mkdtemp(join(parent, '.stage-'));
    try {
      await writeFile(join(stage, 'package.json'), files[0]);
      await writeFile(join(stage, 'package-lock.json'), files[1]);
      const result = runner('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
        cwd: stage, encoding: 'utf8', timeout: 600000,
        env: { PATH: process.env.PATH, HOME: stage, npm_config_userconfig: join(stage, 'no-user-config'), HYPERFRAMES_NO_TELEMETRY: '1' }
      });
      if (result.status !== 0) throw new Error('HyperFrames install failed: ' + (result.stderr || result.error?.message || 'npm failed'));
      await rename(stage, destination);
      return { status: 'ok', destination, actions: [...actions, action('changed', 'install HyperFrames', 'pinned isolated runtime')] };
    } finally { await rm(stage, { recursive: true, force: true }); }
  });
}
