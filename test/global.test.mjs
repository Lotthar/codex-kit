import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { safeExport, setAllowlistedConfig } from '../src/global.mjs';

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
