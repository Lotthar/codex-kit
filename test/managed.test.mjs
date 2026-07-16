import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeManagedBlock, markers, renderManagedBlock } from '../src/managed.mjs';

test('preserves content before and after a bounded global block', () => {
  const block = renderManagedBlock({ scope: 'global', components: ['ponytail'] });
  const once = mergeManagedBlock('Before\n\nAfter\n', block, 'global');
  const twice = mergeManagedBlock(`${once}\nUser text after\n`, block, 'global');
  assert.match(twice, /Before/);
  assert.match(twice, /User text after/);
  assert.equal((twice.match(new RegExp(markers('global').start, 'g')) ?? []).length, 1);
});

test('preserves CRLF and refuses incomplete markers', () => {
  const block = renderManagedBlock({ profiles: ['node'], components: [] });
  assert.match(mergeManagedBlock('Rules\r\n', block), /\r\n/);
  assert.throws(() => mergeManagedBlock(`${markers().start}\ntext`, block), /Conflicting/);
});

test('migrates the v1 project marker pair', () => {
  const block = renderManagedBlock({ profiles: ['generic'], components: [] });
  const output = mergeManagedBlock('<!-- codex-kit:managed:start -->\nold\n<!-- codex-kit:managed:end -->', block);
  assert.match(output, /codex-kit:project:start/);
  assert.doesNotMatch(output, /codex-kit:managed:start/);
});

test('labels global components without implying project scope', () => {
  const block = renderManagedBlock({ scope: 'global', components: ['obsidian-brain'] });
  assert.match(block, /Global component: `obsidian-brain`/);
  assert.doesNotMatch(block, /Project component: `obsidian-brain`/);
});
