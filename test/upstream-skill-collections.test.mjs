import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { applyGlobal, globalPlan } from '../src/global.mjs';

const uiSkills = ['banner-design', 'brand', 'design', 'design-system', 'slides', 'ui-styling', 'ui-ux-pro-max'];
const karpathySkills = ['karpathy-guidelines'];
const pocockSkills = [
  'ask-matt', 'code-review', 'codebase-design', 'diagnosing-bugs', 'domain-modeling', 'grill-me', 'grill-with-docs',
  'grilling', 'handoff', 'implement', 'implement-spec', 'improve-codebase-architecture', 'pr', 'prototype', 'research',
  'retro', 'setup-matt-pocock-skills', 'tdd', 'teach', 'to-questionnaire', 'to-spec', 'to-tickets', 'triage', 'wait-what',
  'wayfinder', 'wizard', 'writing-for-agents'
];
const skills = [...uiSkills, ...karpathySkills, ...pocockSkills];
const explicitOnlyPocockSkills = [
  'ask-matt', 'grill-me', 'grill-with-docs', 'handoff', 'implement', 'implement-spec', 'improve-codebase-architecture',
  'retro', 'setup-matt-pocock-skills', 'teach', 'to-questionnaire', 'to-spec', 'to-tickets', 'triage', 'wait-what', 'wayfinder'
];

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('bundles and plans the stable UI, Karpathy, and Pocock skills globally', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-upstream-skills-plan-'));
  const plan = await globalPlan({ home, preset: 'minimal' });
  for (const name of skills) {
    await access(join('workflow-skills', name, 'SKILL.md'));
    const action = plan.actions.find((item) => item.label === `provision skills/${name}`);
    assert.equal(action?.state, 'planned');
    assert.equal(action?.detail, 'base-policy');
  }
});

test('global setup installs all upstream skills, records ownership, and preserves explicit invocation policies', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-upstream-skills-install-'));
  const first = await applyGlobal(await globalPlan({ home, preset: 'minimal' }));
  assert.equal(first.status, 'ok');
  const policy = await readFile(join(home, 'AGENTS.md'), 'utf8');
  assert.match(policy, /\$kit-engineering/);
  assert.match(policy, /\$kit-ui/);
  assert.match(policy, /\$kit-media/);
  assert.match(policy, /Explicit \$skill-name requests select that skill directly/);
  const receipt = JSON.parse(await readFile(join(home, '.codex-kit', 'global-assets.json'), 'utf8'));
  for (const name of skills) {
    assert.equal(receipt.assets.some((asset) => asset.target === `skills/${name}` && asset.component === 'base-policy'), true);
    await access(join(home, 'skills', name, 'SKILL.md'));
  }
  for (const name of explicitOnlyPocockSkills) {
    const policyFile = await readFile(join(home, 'skills', name, 'agents', 'openai.yaml'), 'utf8');
    assert.match(policyFile, /allow_implicit_invocation: false/);
  }
  const second = await applyGlobal(await globalPlan({ home, preset: 'minimal' }));
  assert.equal(second.status, 'ok');
  for (const name of skills) assert.equal(second.actions.find((item) => item.label === `provision skills/${name}`)?.state, 'unchanged');
});

test('global setup preserves a user-owned upstream skill while installing the rest', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-upstream-skills-collision-'));
  const name = 'ui-ux-pro-max';
  const target = join(home, 'skills', name, 'SKILL.md');
  await mkdir(join(home, 'skills', name), { recursive: true });
  await writeFile(target, '# User-owned UI skill\n');
  const result = await applyGlobal(await globalPlan({ home, preset: 'minimal' }));
  assert.equal(result.status, 'partial');
  assert.equal(await readFile(target, 'utf8'), '# User-owned UI skill\n');
  assert.equal(result.actions.find((item) => item.label === `provision skills/${name}`)?.state, 'conflict');
  await access(join(home, 'skills', 'karpathy-guidelines', 'SKILL.md'));
  await access(join(home, 'skills', 'codebase-design', 'SKILL.md'));
});

test('the installed UI/UX Pro Max search works offline from its Codex global path', async () => {
  const home = await mkdtemp(join(tmpdir(), 'codex-kit-ui-search-'));
  await applyGlobal(await globalPlan({ home, preset: 'minimal' }));
  const result = await run('python3', [join(home, 'skills', 'ui-ux-pro-max', 'scripts', 'search.py'), 'keyboard focus modal', '--domain', 'ux', '-n', '2'], {
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
  });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /keyboard|focus|modal/i);
});
