import { cp, mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { exists, atomicWrite, readJson } from './util.mjs';
import { findProjectRoot } from './project.mjs';

const prohibited = /(?:^|\/)(?:auth\.json|config\.toml|\.env(?:\.|$)|.*(?:token|secret|credential).*)$/i;

async function safeTree(root, path = root) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const absolute = join(path, entry.name);
    const relative = absolute.slice(root.length + 1);
    if (prohibited.test(relative)) throw new Error(`Refusing to import sensitive-looking file: ${relative}`);
    if (entry.isDirectory()) await safeTree(root, absolute);
  }
}

export async function importSkill({ root, sourceRoot, name, execute = false }) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) throw new Error('Skill name must contain only letters, numbers, and hyphens.');
  const projectRoot = await findProjectRoot(root);
  const source = resolve(sourceRoot, name);
  const destination = join(projectRoot, '.agents', 'skills', name);
  if (!exists(source) || !exists(join(source, 'SKILL.md'))) throw new Error(`No portable skill with SKILL.md found at ${source}`);
  if (exists(destination)) throw new Error(`Destination already exists: ${destination}`);
  await safeTree(source);
  const result = { root: projectRoot, source, destination, actions: [{ state: 'planned', label: 'import project skill', detail: `${name} with provenance` }] };
  if (!execute) return result;
  await mkdir(join(projectRoot, '.agents', 'skills'), { recursive: true });
  await cp(source, destination, { recursive: true, errorOnExist: true });
  const receiptPath = join(projectRoot, '.codex-kit', 'imports.json');
  const receipt = await readJson(receiptPath, { schemaVersion: 1, skills: [] });
  receipt.skills.push({ name, source: sourceRoot, importedAt: new Date().toISOString() });
  await atomicWrite(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return { ...result, applied: true };
}
