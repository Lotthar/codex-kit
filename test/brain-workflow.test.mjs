import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brainConfigure } from '../src/obsidian.mjs';
import { brainRegister, loadBrainRegistry } from '../src/brain-registry.mjs';
import { finishProjectSetup, registerProject, rememberAndIndex, resolveBrainContext, setupProject } from '../src/brain-workflow.mjs';

const temporaryHome = () => mkdtemp(join(tmpdir(), 'codex-kit-brain-workflow-'));

function git(root, ...args) {
  execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
}

async function repository() {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-brain-project-'));
  git(root, 'init');
  git(root, 'config', 'user.email', 'tests@example.invalid');
  git(root, 'config', 'user.name', 'Tests');
  return root;
}

function obsidian({ failFiles = false } = {}) {
  const notes = new Map();
  return {
    notes,
    runner: async (_command, args) => {
      const command = args[0]?.startsWith('vault=') ? args.slice(1) : args;
      const value = (name) => command.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
      if (command[0] === 'version') return { status: 0, stdout: '1.12.7\n' };
      if (command[0] === 'vault') return { status: 0, stdout: 'Codex Brain\n' };
      if (command[0] === 'read') return notes.has(value('path')) ? { status: 0, stdout: notes.get(value('path')) } : { status: 1, stderr: 'missing' };
      if (command[0] === 'files') return failFiles ? { status: 1, stderr: 'offline' } : { status: 0, stdout: [...notes.keys()].filter((path) => path.startsWith(`${value('folder')}/`)).join('\n') };
      if (command[0] === 'create') { notes.set(value('path'), value('content')); return { status: 0, stdout: value('path') }; }
      return { status: 1, stderr: 'unsupported' };
    },
  };
}

test('resolves explicitly selected external and projectless Brain projects without requiring Git', async () => {
  const home = await temporaryHome();
  const projectlessRoot = await mkdtemp(join(tmpdir(), 'codex-kit-projectless-'));
  await brainRegister({ home, key: 'external-work', name: 'External', externalId: 'chatgpt:work-1', kind: 'external', execute: true });
  await brainRegister({ home, key: 'notes-work', name: 'Notes', root: projectlessRoot, kind: 'projectless', execute: true });

  const external = await resolveBrainContext({ home, project: 'external-work' });
  assert.equal(external.projectKey, 'external-work');
  assert.equal(external.root, undefined);
  const projectless = await resolveBrainContext({ home, root: projectlessRoot });
  assert.equal(projectless.projectKey, 'notes-work');
  assert.equal(projectless.entry.kind, 'projectless');
});

test('registerProject preserves a repository-configured Brain key', async () => {
  const home = await temporaryHome();
  const root = await repository();
  await mkdir(join(root, '.codex-kit'), { recursive: true });
  await writeFile(join(root, '.codex-kit', 'config.json'), JSON.stringify({ schemaVersion: 2, preset: 'minimal', profiles: { mode: 'auto', include: [], exclude: [] }, components: { include: [], exclude: [] }, features: { enrichment: false }, tools: { graphify: {}, obsidian: { projectKey: 'stable-repository-key' } } }));

  const registered = await registerProject({ home, root, name: 'Stable repository', execute: true });
  assert.equal(registered.project.key, 'stable-repository-key');
  assert.equal((await loadBrainRegistry({ home })).projects[0].key, 'stable-repository-key');
});

test('empty Git setup registers the allocated key used by project configuration', async () => {
  const home = await temporaryHome();
  const root = await repository();
  const fake = obsidian();
  await brainConfigure({ home, vault: 'Codex Brain', execute: true });

  const result = await setupProject({ home, root, preset: 'personal', execute: true, runner: fake.runner });
  assert.equal(result.status, 'ok');
  const config = JSON.parse(await readFile(join(root, '.codex-kit', 'config.json'), 'utf8'));
  const registry = await loadBrainRegistry({ home });
  assert.match(config.tools.obsidian.projectKey, /^[a-z0-9][a-z0-9-]+$/);
  assert.equal(registry.projects[0].key, config.tools.obsidian.projectKey);
  assert.equal(fake.notes.has(`Projects/${config.tools.obsidian.projectKey}/Home.md`), true);
});

test('keeps a successfully remembered note distinct from a failed index refresh', async () => {
  const home = await temporaryHome();
  const fake = obsidian({ failFiles: true });
  await brainConfigure({ home, vault: 'Codex Brain', execute: true });
  await brainRegister({ home, key: 'capture-work', name: 'Capture', externalId: 'work:capture', kind: 'external', execute: true });

  const result = await rememberAndIndex({ home, projectKey: 'capture-work', kind: 'decision', title: 'Keep source evidence', summary: 'Capture succeeded.', source: 'test', execute: true, runner: fake.runner, idFactory: () => '1234567890abcdef' });
  assert.equal(result.remembered, true);
  assert.equal(result.status, 'partial');
  assert.equal(result.indexed, false);
  assert.equal(result.actions.some((item) => item.label === 'remember Obsidian project memory' && item.state === 'changed'), true);
});

test('finishProjectSetup reports an index failure after successful registration and initialization', async () => {
  const home = await temporaryHome();
  const fake = obsidian({ failFiles: true });
  await brainConfigure({ home, vault: 'Codex Brain', execute: true });
  const result = await finishProjectSetup({ home, execute: true, runner: fake.runner, result: { status: 'ok', project: 'Sample', root: '/tmp/sample', config: { tools: { obsidian: { projectKey: 'sample-work' } } }, components: ['obsidian-brain'], actions: [] } });
  assert.equal(result.registration.status, 'ok');
  assert.equal(result.brain.status, 'ok');
  assert.equal(result.status, 'partial');
  assert.equal(result.indexed, false);
});

test('Brain project preview lists registration, namespace, and index effects without writes', async () => {
  const home = await temporaryHome();
  const result = await finishProjectSetup({ home, result: { status: 'ok', project: 'Preview', root: '/tmp/preview-work', config: { tools: { obsidian: { projectKey: 'preview-work' } } }, components: ['obsidian-brain'], actions: [] } });
  assert.equal(result.brainSetup.projectKey, 'preview-work');
  assert.equal(result.brainSetup.allocateProjectKeyOnApply, false);
  assert.deepEqual(result.actions.map((item) => item.label), ['register brain project', 'initialize project Brain', 'reconcile Brain indexes']);
  assert.equal((await loadBrainRegistry({ home })).projects.length, 0);
});

test('Brain project preview skips namespace and indexes for excluded projects', async () => {
  const home = await temporaryHome();
  await brainRegister({ home, key: 'excluded-work', name: 'Excluded', root: '/tmp/excluded-work', kind: 'git', inclusion: 'excluded', execute: true });
  const result = await finishProjectSetup({ home, result: { status: 'ok', project: 'Excluded', root: '/tmp/excluded-work', config: { tools: { obsidian: { projectKey: 'excluded-work' } } }, components: ['obsidian-brain'], actions: [] } });
  assert.equal(result.brainSetup.inclusion, 'excluded');
  assert.deepEqual(result.actions.slice(-2).map((item) => item.state), ['skipped', 'skipped']);
});
