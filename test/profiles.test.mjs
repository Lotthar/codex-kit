import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectProfiles } from '../src/profiles.mjs';

test('detects Nuxt and Node', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-profile-'));
  await writeFile(join(root, 'package.json'), '{}');
  await writeFile(join(root, 'nuxt.config.ts'), 'export default {}');
  const result = await detectProfiles(root);
  assert.deepEqual(result.profiles, ['nuxt', 'node']);
});

test('recommends Graphify for a monorepo marker', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-profile-'));
  await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages: []');
  const result = await detectProfiles(root);
  assert.equal(result.graphifyRecommended, true);
});
