import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { safeExport } from '../src/global.mjs';

test('exports only portable inventory', async () => {
  const source = await mkdtemp(join(tmpdir(), 'codex-kit-export-'));
  await writeFile(join(source, 'AGENTS.md'), 'private rules');
  await writeFile(join(source, 'auth.json'), 'secret');
  await mkdir(join(source, 'skills', 'safe-skill'), { recursive: true });
  const result = await safeExport(source);
  assert.deepEqual(result.artifacts, [{ type: 'policy', path: 'AGENTS.md' }, { type: 'skills', names: ['safe-skill'] }]);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});
