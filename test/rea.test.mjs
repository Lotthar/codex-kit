import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFile as execFileCallback } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { reaStatus, removeRea, setupRea } from '../src/rea.mjs';

const skillName = 'reverse-engineer-anything';
const skillPath = (userHome) => join(userHome, '.agents', 'skills', skillName);
const statePath = (home) => join(home, '.codex-kit', 'rea.json');
const execFile = promisify(execFileCallback);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-rea-'));
  const home = join(root, 'codex-home');
  const userHome = join(root, 'user-home');
  await Promise.all([mkdir(home), mkdir(userHome)]);
  return { root, home, userHome };
}

function fakeRunner(result) {
  const calls = [];
  return {
    calls,
    runner(command, args, options) {
      calls.push({ command, args, options });
      if (result !== undefined) return result;
      const config = options?.env?.CODEX_HOME ? `${options.env.CODEX_HOME}/config.toml` : '';
      const configured = config && existsSync(config) && /\[mcp_servers\.rea\]/.test(readFileSync(config, 'utf8'));
      if (args.join(' ') === 'mcp list --json') {
        if (!configured) return { status: 0, stdout: '[]' };
        const text = readFileSync(config, 'utf8');
        const command = JSON.parse(text.match(/^command\s*=\s*(.+)$/m)[1]);
        const mcpArgs = JSON.parse(text.match(/^args\s*=\s*(.+)$/m)[1]);
        const env = Object.fromEntries([...text.matchAll(/^([A-Z_]+)\s*=\s*(.+)$/gm)].map(([, key, value]) => [key, JSON.parse(value)]));
        return { status: 0, stdout: JSON.stringify([{ name: 'rea', enabled: true, transport: { type: 'stdio', command, args: mcpArgs, env, env_vars: [], cwd: null }, startup_timeout_sec: 30, tool_timeout_sec: 600 }]) };
      }
      if (args.join(' ') === 'mcp get rea --json') return configured ? { status: 0, stdout: '{"name":"rea"}' } : { status: 1, stderr: 'not found' };
      throw new Error(`Unexpected Codex command: ${command} ${args.join(' ')}`);
    }
  };
}

function fakeProvision({ calls = [], error, skillContent = '# Fixture\n' } = {}) {
  return async ({ home, allowNetwork }) => {
    calls.push({ home, allowNetwork });
    if (error) throw error;
    const root = join(home, '.codex-kit', 'rea', 'tools', 'fixture');
    const source = join(root, 'skill');
    await mkdir(source, { recursive: true });
    await writeFile(join(source, 'SKILL.md'), `---\nname: reverse-engineer-anything\n---\n${skillContent}`);
    return {
      version: '6.4.0',
      artifacts: [{ name: 'rea', version: '6.4.0', url: 'https://example.invalid/rea.tgz' }],
      paths: {
        root,
        node: join(root, 'node', 'bin', 'node'),
        cli: join(root, 'npm', 'rea.mjs'),
        skillSource: source,
        env: { JAVA_HOME: join(root, 'java'), REA_JADX_MCP_JAR: join(root, 'jadx.jar') }
      }
    };
  };
}

test('REA preview is side-effect-free and does not invoke Codex or provisioning', async () => {
  const { home, userHome } = await fixture();
  const fake = fakeRunner();
  const provisionCalls = [];
  const result = await setupRea({ home, userHome, runner: fake.runner, provision: fakeProvision({ calls: provisionCalls }) });

  assert.equal(result.status, 'planned');
  assert.deepEqual(fake.calls, []);
  assert.deepEqual(provisionCalls, []);
  assert.equal(existsSync(join(home, 'config.toml')), false);
  assert.equal(existsSync(join(home, 'AGENTS.md')), false);
  assert.equal(existsSync(statePath(home)), false);
  assert.equal(existsSync(skillPath(userHome)), false);
});

test('REA rolls back lifecycle files when post-write MCP acceptance fails', async () => {
  const { home, userHome } = await fixture();
  const base = fakeRunner();
  let calls = 0;
  const runner = (...args) => {
    calls += 1;
    if (calls === 3) return { status: 0, stdout: '[]' };
    return base.runner(...args);
  };
  await assert.rejects(() => setupRea({ home, userHome, execute: true, allowNetwork: true, runner, provision: fakeProvision() }), /REA MCP|accept/i);
  assert.equal(calls, 3);
  assert.equal(existsSync(join(home, 'config.toml')), false);
  assert.equal(existsSync(join(home, 'AGENTS.md')), false);
  assert.equal(existsSync(statePath(home)), false);
  assert.equal(existsSync(skillPath(userHome)), false);
});

test('REA refuses a provisioned toolchain root outside its owned tools directory', async () => {
  const { root, home, userHome } = await fixture();
  const outside = join(root, 'outside-toolchain');
  const source = join(outside, 'skill');
  await mkdir(source, { recursive: true });
  await writeFile(join(source, 'SKILL.md'), '# hostile\n');
  const provision = async () => ({ version: '6.4.0', artifacts: [], paths: { root: outside, node: join(outside, 'node'), cli: join(outside, 'rea.mjs'), skillSource: source, env: {} } });
  await assert.rejects(() => setupRea({ home, userHome, execute: true, allowNetwork: true, runner: fakeRunner().runner, provision }), /toolchain root|owned tools/i);
  assert.equal(existsSync(join(home, 'config.toml')), false);
  assert.equal(existsSync(statePath(home)), false);
  assert.equal(existsSync(skillPath(userHome)), false);
});

test('REA setup requires explicit network consent before a download-capable provisioner can apply', async () => {
  const { home, userHome } = await fixture();
  const fake = fakeRunner();
  const provisionCalls = [];
  const provision = async (options) => {
    provisionCalls.push(options);
    if (!options.allowNetwork) throw new Error('network consent required');
    return fakeProvision() (options);
  };

  await assert.rejects(() => setupRea({ home, userHome, execute: true, runner: fake.runner, provision }), /network consent required/);
  assert.equal(provisionCalls.length, 1);
  assert.equal(provisionCalls[0].allowNetwork, false);
  assert.equal(existsSync(join(home, 'config.toml')), false);
  assert.equal(existsSync(skillPath(userHome)), false);
});

test('REA setup records owned lifecycle content and is idempotent', async () => {
  const { home, userHome } = await fixture();
  const fake = fakeRunner();
  const provisionCalls = [];
  const options = { home, userHome, execute: true, allowNetwork: true, runner: fake.runner, provision: fakeProvision({ calls: provisionCalls }) };

  assert.equal((await setupRea(options)).status, 'ok');
  const config = await readFile(join(home, 'config.toml'), 'utf8');
  assert.match(config, /# codex-kit:rea:mcp:start/);
  assert.match(config, /\[mcp_servers\.rea\]/);
  assert.match(config, /args = \[[^\]]+"mcp"\]/);
  assert.match(await readFile(join(home, 'AGENTS.md'), 'utf8'), /Before editing the destination/);
  assert.equal(existsSync(join(skillPath(userHome), 'SKILL.md')), true);
  assert.equal((await reaStatus({ home, userHome })).status, 'ok');

  assert.equal((await setupRea(options)).status, 'ok');
  assert.equal((await reaStatus({ home, userHome })).status, 'ok');
  assert.equal((await readFile(join(home, 'config.toml'), 'utf8')).match(/# codex-kit:rea:mcp:start/g).length, 1);
  assert.equal(fake.calls.length, 6);
  assert.equal(fake.calls.every(({ command, args }) => command === 'codex' && ['mcp list --json', 'mcp get rea --json'].includes(args.join(' '))), true);
  assert.equal(provisionCalls.length, 2);
});

test('REA refreshes a receipt-owned canonical skill and reports a deleted toolchain as partial', async () => {
  const { home, userHome } = await fixture();
  const fake = fakeRunner();
  const first = fakeProvision({ skillContent: '# first\n' });
  await setupRea({ home, userHome, execute: true, allowNetwork: true, runner: fake.runner, provision: first });
  const second = fakeProvision({ skillContent: '# second\n' });
  await setupRea({ home, userHome, execute: true, allowNetwork: true, runner: fake.runner, provision: second });
  assert.match(await readFile(join(skillPath(userHome), 'SKILL.md'), 'utf8'), /# second/);

  const receipt = JSON.parse(await readFile(statePath(home), 'utf8'));
  await (await import('node:fs/promises')).rm(receipt.toolchain.root, { recursive: true, force: true });
  const status = await reaStatus({ home, userHome });
  assert.equal(status.status, 'partial');
  assert.equal(status.actions.some((item) => item.label === 'REA toolchain' && item.state === 'warning'), true);
});

test('REA leaves no lifecycle files when Codex MCP validation becomes malformed during setup', async () => {
  const { home, userHome } = await fixture();
  const calls = [];
  const runner = () => {
    calls.push(true);
    return calls.length === 1 ? { status: 0, stdout: '{}' } : { status: 0, stdout: 'not json' };
  };
  const result = await setupRea({ home, userHome, execute: true, allowNetwork: true, runner, provision: fakeProvision() });
  assert.equal(result.status, 'partial');
  assert.equal(existsSync(join(home, 'config.toml')), false);
  assert.equal(existsSync(join(home, 'AGENTS.md')), false);
  assert.equal(existsSync(statePath(home)), false);
  assert.equal(existsSync(skillPath(userHome)), false);
});

test('REA refuses unowned MCP, duplicate legacy skill, or modified canonical skill before config writes', async (t) => {
  await t.test('unowned config', async () => {
    const { home, userHome } = await fixture();
    const original = '# keep\n[mcp_servers.rea]\ncommand = "user"\n';
    await writeFile(join(home, 'config.toml'), original);
    const provisionCalls = [];
    const result = await setupRea({ home, userHome, execute: true, allowNetwork: true, provision: fakeProvision({ calls: provisionCalls }) });
    assert.equal(result.status, 'conflict');
    assert.equal(await readFile(join(home, 'config.toml'), 'utf8'), original);
    assert.deepEqual(provisionCalls, []);
  });

  await t.test('legacy duplicate', async () => {
    const { home, userHome } = await fixture();
    const legacy = join(userHome, '.codex', 'skills', skillName);
    await mkdir(legacy, { recursive: true });
    await writeFile(join(legacy, 'SKILL.md'), '# legacy\n');
    const result = await setupRea({ home, userHome, execute: true, allowNetwork: true, provision: fakeProvision() });
    assert.equal(result.status, 'conflict');
    assert.equal(existsSync(join(home, 'config.toml')), false);
  });

  await t.test('modified canonical skill', async () => {
    const { home, userHome } = await fixture();
    await mkdir(skillPath(userHome), { recursive: true });
    await writeFile(join(skillPath(userHome), 'SKILL.md'), '# user-owned\n');
    const result = await setupRea({ home, userHome, execute: true, allowNetwork: true, provision: fakeProvision() });
    assert.equal(result.status, 'conflict');
    assert.equal(existsSync(join(home, 'config.toml')), false);
  });
});

test('REA remove preserves unrelated TOML, comments, and a modified managed skill', async () => {
  const { home, userHome } = await fixture();
  await writeFile(join(home, 'config.toml'), '# human comment\n[features]\nkeep = true\n');
  await writeFile(join(home, 'AGENTS.md'), '# Human instructions\n');
  const fake = fakeRunner();
  const options = { home, userHome, execute: true, allowNetwork: true, runner: fake.runner, provision: fakeProvision() };
  await setupRea(options);
  await writeFile(join(skillPath(userHome), 'user-note.md'), 'do not delete\n');

  const result = await removeRea({ home, userHome, execute: true, runner: fake.runner });
  assert.equal(result.status, 'partial');
  const config = await readFile(join(home, 'config.toml'), 'utf8');
  assert.match(config, /# human comment/);
  assert.match(config, /keep = true/);
  assert.doesNotMatch(config, /codex-kit:rea:mcp/);
  assert.match(await readFile(join(home, 'AGENTS.md'), 'utf8'), /# Human instructions/);
  assert.equal(existsSync(join(skillPath(userHome), 'user-note.md')), true);
  assert.equal(existsSync(statePath(home)), true);
});

test('REA remove deletes only an unchanged owned toolchain and retains a modified one', async (t) => {
  await t.test('unchanged installation', async () => {
    const { home, userHome } = await fixture();
    const fake = fakeRunner();
    await setupRea({ home, userHome, execute: true, allowNetwork: true, runner: fake.runner, provision: fakeProvision() });
    const receipt = JSON.parse(await readFile(statePath(home), 'utf8'));
    const result = await removeRea({ home, userHome, execute: true, runner: fake.runner });
    assert.equal(result.status, 'ok');
    assert.equal(existsSync(receipt.toolchain.root), false);
    assert.equal(existsSync(skillPath(userHome)), false);
    assert.equal(existsSync(statePath(home)), false);
  });

  await t.test('modified installation', async () => {
    const { home, userHome } = await fixture();
    const fake = fakeRunner();
    await setupRea({ home, userHome, execute: true, allowNetwork: true, runner: fake.runner, provision: fakeProvision() });
    const receipt = JSON.parse(await readFile(statePath(home), 'utf8'));
    await writeFile(join(receipt.toolchain.root, 'user-change.txt'), 'preserve\n');
    const result = await removeRea({ home, userHome, execute: true, runner: fake.runner });
    assert.equal(result.status, 'partial');
    assert.equal(existsSync(join(receipt.toolchain.root, 'user-change.txt')), true);
    assert.equal(existsSync(statePath(home)), true);
  });
});

test('REA setup rolls back copied skill and config when a symlinked policy target rejects the transaction', async () => {
  const { root, home, userHome } = await fixture();
  const outside = join(root, 'outside-agents.md');
  await writeFile(outside, '# outside\n');
  await symlink(outside, join(home, 'AGENTS.md'));

  const fake = fakeRunner();
  await assert.rejects(() => setupRea({ home, userHome, execute: true, allowNetwork: true, runner: fake.runner, provision: fakeProvision() }), /[Ss]ymlink|junction/);
  assert.equal(existsSync(skillPath(userHome)), false);
  assert.equal(existsSync(join(home, 'config.toml')), false);
  assert.equal(await lstat(join(home, 'AGENTS.md')).then((entry) => entry.isSymbolicLink()), true);
  assert.equal(await readFile(outside, 'utf8'), '# outside\n');
});

test('REA removal rolls back both roots when Codex rejects the resulting configuration', async () => {
  const { home, userHome } = await fixture();
  const fake = fakeRunner();
  await setupRea({ home, userHome, execute: true, allowNetwork: true, runner: fake.runner, provision: fakeProvision() });
  const config = await readFile(join(home, 'config.toml'), 'utf8');
  const stateText = await readFile(statePath(home), 'utf8');
  const state = JSON.parse(stateText);
  let checks = 0;
  const runner = (...args) => ++checks === 2 ? { status: 0, stdout: '[{"name":"rea"}]' } : fake.runner(...args);
  await assert.rejects(() => removeRea({ home, userHome, execute: true, runner }), /rejected the REA removal/);
  assert.equal(await readFile(join(home, 'config.toml'), 'utf8'), config);
  assert.equal(await readFile(statePath(home), 'utf8'), stateText);
  assert.equal(existsSync(state.toolchain.root), true);
  assert.equal(existsSync(join(skillPath(userHome), 'SKILL.md')), true);
  assert.equal((await reaStatus({ home, userHome })).status, 'ok');
});

test('REA preserves quoted environment overrides appended outside its managed block', async () => {
  const { home, userHome } = await fixture();
  const fake = fakeRunner();
  await setupRea({ home, userHome, execute: true, allowNetwork: true, runner: fake.runner, provision: fakeProvision() });
  const configPath = join(home, 'config.toml');
  const modified = `${await readFile(configPath, 'utf8')}"EXTRA" = "keep"\n`;
  await writeFile(configPath, modified);
  assert.equal((await reaStatus({ home, userHome })).status, 'partial');
  assert.equal((await removeRea({ home, userHome })).status, 'conflict');
  assert.equal(await readFile(configPath, 'utf8'), modified);
});

test('REA workflow policy remains source-only and requires a plan before implementation', async () => {
  const text = await readFile(new URL('../policies/rea-workflow.md', import.meta.url), 'utf8');
  assert.match(text, /For a complete source repository, use normal repository tools first/);
  assert.match(text, /present the smallest adaptation plan/);
  assert.match(text, /Wait for approval unless immediate implementation was explicitly requested/);
});

test('REA safe extractor restores executable bits from a validated ZIP entry', async () => {
  const { root } = await fixture();
  const archive = join(root, 'tool.zip');
  const output = join(root, 'output');
  await execFile('python3', ['-c', "import stat, sys, zipfile\nz=zipfile.ZipInfo('tool/run.sh'); z.external_attr=(stat.S_IFREG|0o755)<<16\nwith zipfile.ZipFile(sys.argv[1], 'w') as f: f.writestr(z, '#!/bin/sh\\necho ok\\n')", archive]);
  await execFile('python3', [new URL('../src/rea-extract.py', import.meta.url).pathname, archive, output]);
  const mode = (await lstat(join(output, 'tool', 'run.sh'))).mode & 0o777;
  assert.equal(mode & 0o111, 0o111);
});
