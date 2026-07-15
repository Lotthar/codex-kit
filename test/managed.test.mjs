import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeManagedBlock, renderManagedBlock, START, END } from '../src/managed.mjs';

test('adds a single managed block without losing user content', () => {
  const block = renderManagedBlock({ profiles: ['node'], components: ['ponytail'] });
  const output = mergeManagedBlock('# Team rules\n', block);
  assert.match(output, /# Team rules/);
  assert.match(output, new RegExp(START));
  assert.match(output, new RegExp(END));
});

test('replaces its bounded managed block', () => {
  const first = renderManagedBlock({ profiles: ['generic'], components: ['base-policy'] });
  const second = renderManagedBlock({ profiles: ['nuxt'], components: ['graphify'] });
  const output = mergeManagedBlock(`Before\n\n${first}\nAfter\n`, second);
  assert.match(output, /`nuxt`/);
  assert.doesNotMatch(output, /`generic`/);
  assert.match(output, /After/);
});

test('refuses incomplete markers', () => {
  assert.throws(() => mergeManagedBlock(`${START}\ntext`, 'new'), /Conflicting/);
});
