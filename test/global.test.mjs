import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyGlobal, globalPlan, safeExport, setAllowlistedConfig } from '../src/global.mjs';
import { pathHash } from '../src/transaction.mjs';

const ponytailId = 'ponytail@ponytail';

function ponytailRunner({ version, enabled = true, list = true, installVersion = '5.3.3', marketplaceStatus = 0, installStatus = 0 } = {}) {
  const calls = [];
  let installedVersion = version;
  return {
    calls,
    runner(command, args, options) {
      calls.push({ command, args, options });
      if (args.join(' ') === 'plugin list --json') return list ? { status: 0, stdout: JSON.stringify({ installed: installedVersion ? [{ pluginId: ponytailId, version: installedVersion, enabled }] : [] }) } : { status: 1, stderr: 'unavailable' };
      if (args.join(' ') === 'plugin marketplace add DietrichGebert/ponytail --ref 7801d061243d7b753bad0e0b3c057cd250b11755') return { status: marketplaceStatus, stderr: 'marketplace failed' };
      if (args.join(' ') === 'plugin add ponytail@ponytail --json') {
        if (installStatus === 0) installedVersion = installVersion;
        return { status: installStatus, stderr: 'install failed' };
      }
      if (args.join(' ') === 'plugin remove ponytail@ponytail') return { status: 0 };
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    }
  };
}

async function ponytailPlan(home) {
  return globalPlan({ home, components: ['ponytail'] });
}

test('global Ponytail setup leaves the locked installed version unchanged', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-ponytail-current-'));
  const fake = ponytailRunner({ version: '5.3.3' });
  const result = await applyGlobal(await ponytailPlan(home), true, fake.runner);
  assert.equal(result.status, 'ok');
  assert.deepEqual(fake.calls.map(({ args }) => args), [['plugin', 'list', '--json']]);
  assert.match(result.actions.find((item) => item.label === 'install ponytail').detail, /already matches/);
});

test('global Ponytail setup updates an older or missing locked plugin and verifies it', async (t) => {
  for (const version of ['4.8.4', undefined]) await t.test(version ?? 'missing', async () => {
    const home = await mkdtemp(join(tmpdir(), 'codex-kit-ponytail-update-'));
    const fake = ponytailRunner({ version });
    const result = await applyGlobal(await ponytailPlan(home), true, fake.runner);
    assert.equal(result.status, 'ok');
    assert.deepEqual(fake.calls.map(({ args }) => args), [
      ['plugin', 'list', '--json'],
      ['plugin', 'marketplace', 'add', 'DietrichGebert/ponytail', '--ref', '7801d061243d7b753bad0e0b3c057cd250b11755'],
      ['plugin', 'add', ponytailId, '--json'],
      ['plugin', 'list', '--json']
    ]);
    assert.equal(fake.calls.every(({ options }) => options.env.CODEX_HOME === home), true);
    assert.equal(fake.calls.every(({ options }) => options.env.PATH === process.env.PATH), true);
  });
});

test('global Ponytail setup preserves newer, disabled, unrelated, and unreadable installs', async (t) => {
  await t.test('newer', async () => {
    const home = await mkdtemp(join(tmpdir(), 'codex-kit-ponytail-newer-'));
    const fake = ponytailRunner({ version: '5.4.0+build' });
    const result = await applyGlobal(await ponytailPlan(home), true, fake.runner);
    assert.equal(result.status, 'partial');
    assert.equal(fake.calls.length, 1);
    assert.match(result.actions.find((item) => item.label === 'install ponytail').detail, /newer/);
  });
  await t.test('unrelated plugin', async () => {
    const home = await mkdtemp(join(tmpdir(), 'codex-kit-ponytail-unrelated-'));
    const fake = ponytailRunner({ version: undefined });
    fake.runner = (command, args) => {
      fake.calls.push({ command, args });
      if (args.join(' ') === 'plugin list --json') return { status: 0, stdout: JSON.stringify({ installed: [{ pluginId: 'pony@other', version: '5.3.3' }] }) };
      if (args.join(' ') === 'plugin marketplace add DietrichGebert/ponytail --ref 7801d061243d7b753bad0e0b3c057cd250b11755') return { status: 0 };
      if (args.join(' ') === 'plugin add ponytail@ponytail --json') return { status: 0 };
      if (args.join(' ') === 'plugin remove ponytail@ponytail') return { status: 0 };
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    };
    await assert.rejects(async () => applyGlobal(await ponytailPlan(home), true, fake.runner), /rejected the installed ponytail version/);
    assert.equal(fake.calls.some(({ args }) => args.join(' ') === 'plugin remove ponytail@ponytail'), true);
  });
  await t.test('disabled', async () => {
    const home = await mkdtemp(join(tmpdir(), 'codex-kit-ponytail-disabled-'));
    const fake = ponytailRunner({ version: '4.8.4', enabled: false });
    const result = await applyGlobal(await ponytailPlan(home), true, fake.runner);
    assert.equal(result.status, 'partial');
    assert.equal(fake.calls.length, 1);
    assert.match(result.actions.find((item) => item.label === 'install ponytail').detail, /disabled/);
  });
  await t.test('failed inspection', async () => {
    const home = await mkdtemp(join(tmpdir(), 'codex-kit-ponytail-unreadable-'));
    const fake = ponytailRunner({ list: false });
    await assert.rejects(async () => applyGlobal(await ponytailPlan(home), true, fake.runner), /Unable to install ponytail@ponytail/);
    assert.equal(fake.calls.length, 1);
  });
  await t.test('marketplace failure', async () => {
    const home = await mkdtemp(join(tmpdir(), 'codex-kit-ponytail-marketplace-failure-'));
    const fake = ponytailRunner({ version: '4.8.4', marketplaceStatus: 1 });
    await assert.rejects(async () => applyGlobal(await ponytailPlan(home), true, fake.runner), /marketplace failed/);
    assert.deepEqual(fake.calls.map(({ args }) => args), [
      ['plugin', 'list', '--json'],
      ['plugin', 'marketplace', 'add', 'DietrichGebert/ponytail', '--ref', '7801d061243d7b753bad0e0b3c057cd250b11755']
    ]);
    assert.equal(fake.calls.every(({ options }) => options.env.CODEX_HOME === home), true);
  });
  await t.test('malformed inspection', async () => {
    const home = await mkdtemp(join(tmpdir(), 'codex-kit-ponytail-malformed-'));
    const fake = ponytailRunner();
    fake.runner = (command, args) => {
      fake.calls.push({ command, args });
      return { status: 0, stdout: '{' };
    };
    await assert.rejects(async () => applyGlobal(await ponytailPlan(home), true, fake.runner), /did not return JSON/);
    assert.equal(fake.calls.length, 1);
  });
});

test('global Ponytail setup retains an existing plugin after update or readback failure', async (t) => {
  await t.test('install failure', async () => {
    const home = await mkdtemp(join(tmpdir(), 'codex-kit-ponytail-install-failure-'));
    const fake = ponytailRunner({ version: '4.8.4', installStatus: 1 });
    await assert.rejects(async () => applyGlobal(await ponytailPlan(home), true, fake.runner), /install failed/);
    assert.equal(fake.calls.some(({ args }) => args.join(' ') === 'plugin remove ponytail@ponytail'), false);
  });
  await t.test('readback failure', async () => {
    const home = await mkdtemp(join(tmpdir(), 'codex-kit-ponytail-readback-failure-'));
    const fake = ponytailRunner({ version: '4.8.4', installVersion: '5.3.2' });
    await assert.rejects(async () => applyGlobal(await ponytailPlan(home), true, fake.runner), /rejected the installed ponytail version/);
    assert.equal(fake.calls.some(({ args }) => args.join(' ') === 'plugin remove ponytail@ponytail'), false);
  });
  await t.test('new-install readback failure rolls back in the selected home', async () => {
    const home = await mkdtemp(join(tmpdir(), 'codex-kit-ponytail-rollback-home-'));
    const fake = ponytailRunner({ installVersion: '5.3.2' });
    await assert.rejects(async () => applyGlobal(await ponytailPlan(home), true, fake.runner), /rejected the installed ponytail version/);
    assert.equal(fake.calls.at(-1).args.join(' '), 'plugin remove ponytail@ponytail');
    assert.equal(fake.calls.every(({ options }) => options.env.CODEX_HOME === home), true);
  });
});

test('global Ponytail setup remains network-gated', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-ponytail-no-network-'));
  const fake = ponytailRunner({ version: '4.8.4' });
  const result = await applyGlobal(await ponytailPlan(home), false, fake.runner);
  assert.equal(result.status, 'ok');
  assert.deepEqual(fake.calls, []);
});

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

test('on-demand skill setup is opt-in and preserves skill config entries', async () => {
  const defaultHome = await mkdtemp(join(tmpdir(), 'codex-kit-default-skill-catalog-'));
  const defaultPlan = await globalPlan({ home: defaultHome, preset: 'minimal' });
  assert.equal(defaultPlan.onDemandSkills, false);
  assert.equal(defaultPlan.actions.some((item) => item.label === 'use on-demand skill discovery'), false);
  await applyGlobal(defaultPlan);
  await assert.rejects(readFile(join(defaultHome, 'config.toml'), 'utf8'), { code: 'ENOENT' });

  const home = await mkdtemp(join(tmpdir(), 'codex-kit-on-demand-skill-catalog-'));
  await writeFile(join(home, 'config.toml'), '[skills]\n\n[[skills.config]]\npath = "/tmp/keep.md"\nenabled = false\n');
  const plan = await globalPlan({ home, preset: 'minimal', onDemandSkills: true });
  assert.equal(plan.actions.find((item) => item.label === 'use on-demand skill discovery')?.state, 'planned');
  assert.equal(plan.components.includes('base-policy'), true);
  await applyGlobal(plan);
  const policy = await readFile(join(home, 'AGENTS.md'), 'utf8');
  assert.match(policy, /requested prose rewrites or humanization/);
  assert.match(policy, /one narrow approval to retry the same lookup command/);
  assert.match(policy, /skills\/humanizer\/SKILL\.md/);
  assert.match(await readFile(join(home, 'config.toml'), 'utf8'), /\[skills\]\n\ninclude_instructions = false\n\[\[skills\.config\]\]\npath = "\/tmp\/keep\.md"/);
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

test('every global preset plans the on-request Humanizer skill', async (t) => {
  for (const preset of ['minimal', 'developer', 'personal']) await t.test(preset, async () => {
    const home = await mkdtemp(join(tmpdir(), 'codex-kit-humanizer-plan-'));
    const plan = await globalPlan({ home, preset });
    const action = plan.actions.find((item) => item.label === 'provision skills/humanizer');
    assert.equal(action?.state, 'planned');
    assert.equal(action?.detail, 'base-policy');
  });
});

test('global Humanizer setup installs, records, and preserves the Kit-owned skill', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-humanizer-install-'));
  const skill = join(home, 'skills', 'humanizer', 'SKILL.md');
  const first = await applyGlobal(await globalPlan({ home, preset: 'minimal' }));
  assert.equal(first.status, 'ok');
  assert.match(await readFile(skill, 'utf8'), /name: humanizer/);
  const receipt = JSON.parse(await readFile(join(home, '.codex-kit', 'global-assets.json'), 'utf8'));
  assert.equal(receipt.assets.some((asset) => asset.target === 'skills/humanizer' && asset.component === 'base-policy'), true);

  const second = await applyGlobal(await globalPlan({ home, preset: 'minimal' }));
  assert.equal(second.status, 'ok');
  assert.equal(second.actions.find((item) => item.label === 'provision skills/humanizer')?.state, 'unchanged');
});

test('global Humanizer setup refreshes unchanged owned content from the bundled skill', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-humanizer-update-'));
  const directory = join(home, 'skills', 'humanizer');
  const skill = join(directory, 'SKILL.md');
  const oldSkill = '# Older Kit-owned humanizer\n';
  await mkdir(directory, { recursive: true });
  await writeFile(skill, oldSkill);
  await mkdir(join(home, '.codex-kit'), { recursive: true });
  await writeFile(join(home, '.codex-kit', 'global-assets.json'), `${JSON.stringify({ schemaVersion: 1, assets: [{
    component: 'base-policy',
    source: 'workflow-skills/humanizer',
    target: 'skills/humanizer',
    hash: await pathHash(directory)
  }] }, null, 2)}\n`);

  const result = await applyGlobal(await globalPlan({ home, preset: 'minimal' }));
  assert.equal(result.status, 'ok');
  assert.match(await readFile(skill, 'utf8'), /name: humanizer/);
  assert.equal(result.actions.find((item) => item.label === 'update skills/humanizer')?.state, 'changed');
});

test('global Humanizer setup preserves user-owned and modified content', async (t) => {
  await t.test('existing user-owned skill', async () => {
    const home = await mkdtemp(join(tmpdir(), 'codex-kit-humanizer-collision-'));
    const skill = join(home, 'skills', 'humanizer', 'SKILL.md');
    await mkdir(join(home, 'skills', 'humanizer'), { recursive: true });
    await writeFile(skill, '# User-owned humanizer\n');
    const result = await applyGlobal(await globalPlan({ home, preset: 'minimal' }));
    assert.equal(result.status, 'partial');
    assert.equal(await readFile(skill, 'utf8'), '# User-owned humanizer\n');
    assert.equal(result.actions.find((item) => item.label === 'provision skills/humanizer')?.state, 'conflict');
  });

  await t.test('modified Kit-owned skill remains during removal', async () => {
    const home = await mkdtemp(join(tmpdir(), 'codex-kit-humanizer-modified-'));
    const skill = join(home, 'skills', 'humanizer', 'SKILL.md');
    await applyGlobal(await globalPlan({ home, preset: 'minimal' }));
    await writeFile(skill, '# Modified humanizer\n');
    const result = await applyGlobal(await globalPlan({ home, components: [] }));
    assert.equal(result.status, 'partial');
    assert.equal(await readFile(skill, 'utf8'), '# Modified humanizer\n');
    assert.equal(result.actions.find((item) => item.label === 'remove skills/humanizer')?.state, 'conflict');
  });

  await t.test('modified Kit-owned skill remains during reapply', async () => {
    const home = await mkdtemp(join(tmpdir(), 'codex-kit-humanizer-reapply-'));
    const skill = join(home, 'skills', 'humanizer', 'SKILL.md');
    await applyGlobal(await globalPlan({ home, preset: 'minimal' }));
    await writeFile(skill, '# Modified humanizer\n');
    const result = await applyGlobal(await globalPlan({ home, preset: 'minimal' }));
    assert.equal(result.status, 'partial');
    assert.equal(await readFile(skill, 'utf8'), '# Modified humanizer\n');
    assert.equal(result.actions.find((item) => item.label === 'provision skills/humanizer')?.state, 'conflict');
  });
});

test('global Humanizer removal deletes only unchanged Kit-owned content', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-humanizer-remove-'));
  const skill = join(home, 'skills', 'humanizer');
  await applyGlobal(await globalPlan({ home, preset: 'minimal' }));
  await applyGlobal(await globalPlan({ home, components: [] }));
  assert.equal((await import('node:fs')).existsSync(skill), false);
});

test('global Humanizer setup rolls back copied assets when a later asset fails', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-humanizer-rollback-'));
  const plan = { ...await globalPlan({ home, components: [] }) };
  Object.defineProperty(plan, 'globalAssets', { value: [
    { component: 'base-policy', source: 'workflow-skills/humanizer', target: 'skills/humanizer' },
    { component: 'base-policy', source: 'workflow-skills/missing', target: 'skills/missing' }
  ] });
  await assert.rejects(() => applyGlobal(plan), /ENOENT/);
  assert.equal((await import('node:fs')).existsSync(join(home, 'skills', 'humanizer')), false);
});
