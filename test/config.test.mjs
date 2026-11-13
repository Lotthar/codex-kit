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

test('allows only the native on-demand skills setting', () => {
  const output = setTomlValues('[skills]\nkeep = "value"\n', 'skills', { include_instructions: 'false' });
  assert.match(output, /\[skills\]\nkeep = "value"\n\ninclude_instructions = false/);
  assert.throws(() => setTomlValues('', 'skills', { anything_else: 'true' }), /allowlisted/);
});

test('does not append a top-level skills setting into a skills config array', () => {
  const output = setTomlValues('[skills]\n\n[[skills.config]]\npath = "/tmp/skill.md"\nenabled = false\n', 'skills', { include_instructions: 'false' });
  assert.match(output, /\[skills\]\n\ninclude_instructions = false\n\[\[skills\.config\]\]/);
});
