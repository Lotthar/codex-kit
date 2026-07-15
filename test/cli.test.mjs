import test from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../src/cli.mjs';

test('supports flags before commands and rejects unknown flags', async () => {
  assert.equal(await main(['--json', 'doctor']), 0);
  assert.equal(await main(['--not-a-real-flag', 'doctor']), 1);
});

test('dry-run wins over yes', async () => {
  assert.equal(await main(['setup', '--yes', '--dry-run', '--home', '/tmp/codex-kit-cli-home', '--json']), 0);
});
