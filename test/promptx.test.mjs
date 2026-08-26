import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCompactPrompt, buildEnhancedPrompt } from '../promptx/promptx.mjs';

const profile = {
  root: '/workspace/demo',
  commands: {
    test: 'npm test',
    lint: 'npm run lint',
    typecheck: 'npm run check',
    extra: 'npm run extra',
  },
  sourceFiles: [
    'src/invoice/export.mjs',
    'src/invoice/service.mjs',
    'src/invoice/format.mjs',
    'src/shared/csv.mjs',
    'src/other.mjs',
    'src/overflow.mjs',
  ],
  testFiles: ['test/invoice-export.test.mjs', 'test/overflow.test.mjs'],
  docs: ['README.md'],
  frameworks: ['Node.js'],
  languages: ['JavaScript'],
  packageManager: 'npm',
};

test('compact prompt is deterministic and preserves the bounded packet fields', () => {
  const task = 'Fix invoice CSV export formatting';
  const first = buildCompactPrompt(task, { profile });
  const second = buildCompactPrompt(task, { profile });

  assert.equal(first, second);
  assert.match(first, /^# Compact task packet/m);
  assert.match(first, /^Type: bugfix$/m);
  assert.match(first, /^Likely files:$/m);
  assert.match(first, /^Checks:$/m);
  assert.match(first, /^Material risks:$/m);
  assert.match(first, /^Brain query: fix invoice csv export formatting$/m);
  assert.ok((first.match(/^- `[^`]+`$/gm) || []).length <= 9);
});

test('compact prompt caps files, checks, and UTF-8 bytes', () => {
  const task = `${'ž'.repeat(5000)} fix invoice export`;
  const output = buildCompactPrompt(task, { profile });

  const files = output.slice(output.indexOf('Likely files:'), output.indexOf('Checks:')).match(/^- /gm) || [];
  const checks = output.slice(output.indexOf('Checks:'), output.indexOf('Material risks:')).match(/^- /gm) || [];
  assert.ok(files.length <= 5);
  assert.ok(checks.length <= 4);
  assert.ok(Buffer.byteLength(output, 'utf8') <= 3072);
  assert.doesNotMatch(output, /�/);
});

test('compact prompt redacts secret-looking task content', () => {
  const output = buildCompactPrompt('Fix export with OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456', { profile });

  assert.match(output, /OPENAI_API_KEY=\[REDACTED\]/);
  assert.doesNotMatch(output, /sk-abcdefghijklmnopqrstuvwxyz123456/);
});

test('default enhanced prompt remains the full format', () => {
  const output = buildEnhancedPrompt('Fix invoice CSV export formatting', { profile });

  assert.match(output, /^# Task$/m);
  assert.match(output, /^# Goal$/m);
  assert.match(output, /^# Verification$/m);
  assert.doesNotMatch(output, /# Compact task packet/);
});

test('PromptX CLI parses --compact without rebuilding an existing profile and preserves default output', async () => {
  const fixture = await mkdtemp(join(process.cwd(), '.promptx-cli-fixture-'));
  const cache = join(fixture, '.promptx', 'repo_profile.json');
  try {
    await mkdir(join(fixture, '.promptx'));
    await writeFile(cache, JSON.stringify({ ...profile, root: fixture }));
    const before = await readFile(cache, 'utf8');
    const script = join(process.cwd(), 'promptx', 'promptx.mjs');
    const options = { cwd: fixture, encoding: 'utf8', env: { ...process.env, GIT_CEILING_DIRECTORIES: fixture } };

    const compact = execFileSync(process.execPath, [script, '--compact', 'Fix invoice CSV export formatting'], options);
    const standard = execFileSync(process.execPath, [script, 'Fix invoice CSV export formatting'], options);

    assert.match(compact, /^# Compact task packet$/m);
    assert.match(compact, /^Type: bugfix$/m);
    assert.match(standard, /^# Task$/m);
    assert.doesNotMatch(standard, /# Compact task packet/);
    assert.equal(await readFile(cache, 'utf8'), before);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
