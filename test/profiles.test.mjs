import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectProfiles } from '../src/profiles.mjs';

test('detects Angular with Node', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-angular-'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { '@angular/core': '^20.0.0' } }));
  const result = await detectProfiles(root);
  assert.deepEqual(result.profiles, ['node', 'angular']);
});

test('separates plain Java, Spring, and Quarkus', async () => {
  const plain = await mkdtemp(join(tmpdir(), 'codex-kit-java-'));
  await writeFile(join(plain, 'pom.xml'), '<project/>');
  assert.deepEqual((await detectProfiles(plain)).profiles, ['java']);
  const spring = await mkdtemp(join(tmpdir(), 'codex-kit-spring-'));
  await writeFile(join(spring, 'build.gradle'), "plugins { id 'org.springframework.boot' version '3.5.0' }");
  assert.deepEqual((await detectProfiles(spring)).profiles, ['java', 'spring']);
  const quarkus = await mkdtemp(join(tmpdir(), 'codex-kit-quarkus-'));
  await writeFile(join(quarkus, 'pom.xml'), '<artifactId>quarkus-resteasy</artifactId>');
  assert.deepEqual((await detectProfiles(quarkus)).profiles, ['java', 'quarkus']);
});

test('recommends Graphify for three actual packages', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-kit-packages-'));
  for (const name of ['one', 'two', 'three']) await (await import('node:fs/promises')).mkdir(join(root, 'packages', name), { recursive: true });
  assert.equal((await detectProfiles(root)).graphifyRecommended, true);
});
