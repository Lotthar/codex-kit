import test from 'node:test';
import assert from 'node:assert/strict';
import { setTomlValues } from '../src/config.mjs';

test('updates only allowlisted top-level TOML sections', () => {
  const output = setTomlValues('[features]\nold = false\n\n[other]\nkeep = true\n', 'features', { old: 'true', enabled: 'false' });
  assert.match(output, /old = true/);
  assert.match(output, /enabled = false/);
  assert.match(output, /\[other\]\nkeep = true/);
});

test('rejects non-allowlisted TOML sections', () => {
  assert.throws(() => setTomlValues('', 'mcp_servers', { x: 'true' }), /allowlisted/);
});

test('preserves CRLF and rejects duplicate tables', () => {
  const output = setTomlValues('[features]\r\nold = false\r\n', 'features', { old: 'true' });
  assert.match(output, /\r\n/);
  assert.throws(() => setTomlValues('[features]\na = true\n[features]\nb = false\n', 'features', { a: 'false' }), /Duplicate/);
});
