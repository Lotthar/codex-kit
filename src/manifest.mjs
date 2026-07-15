import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readJson } from './util.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const kitRoot = root;
export const loadManifest = () => readJson(resolve(root, 'catalog/codex-kit.json'));
export const loadLock = () => readJson(resolve(root, 'catalog/codex-kit.lock.json'));

export async function presetComponents(name = 'developer') {
  const manifest = await loadManifest();
  if (!manifest.presets[name]) throw new Error(`Unknown preset: ${name}`);
  return manifest.presets[name];
}
