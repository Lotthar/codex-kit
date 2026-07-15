import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, resolve, win32 } from 'node:path';
import { exists, readJson } from './util.mjs';
import { isWithin } from './platform.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const kitRoot = root;
export const loadManifest = () => readJson(resolve(root, 'catalog/codex-kit.json'));
export const loadLock = () => readJson(resolve(root, 'catalog/codex-kit.lock.json'));

export async function validateCatalog() {
  const [manifest, lock] = await Promise.all([loadManifest(), loadLock()]);
  if (manifest.schemaVersion !== 2 || lock.lockVersion !== 2) throw new Error('Unsupported Codex Kit catalog version.');
  for (const platform of manifest.platforms) if (!['linux', 'win32'].includes(platform)) throw new Error(`Unsupported platform declaration: ${platform}`);
  for (const [name, components] of Object.entries(manifest.presets)) {
    if (!Array.isArray(components)) throw new Error(`Preset ${name} must be an array.`);
    for (const id of components) if (!manifest.components[id]) throw new Error(`Preset ${name} references unknown component ${id}.`);
  }
  for (const [id, component] of Object.entries(manifest.components)) {
    if (!['policy', 'plugin', 'mcp', 'project-tool'].includes(component.kind)) throw new Error(`Component ${id} has an unsupported kind.`);
    if (!Array.isArray(component.scope)) throw new Error(`Component ${id} must declare scope.`);
    if (component.version && lock.components[id]?.version !== component.version) throw new Error(`Lock drift for ${id}.`);
    for (const asset of component.assets ?? []) {
      const source = resolve(root, asset.source ?? '');
      if (!asset.source || win32.isAbsolute(asset.source) || source === root || !isWithin(root, source) || !exists(source)) throw new Error(`Component ${id} has an invalid asset source.`);
      if (!asset.target || isAbsolute(asset.target) || win32.isAbsolute(asset.target) || asset.target.split(/[\\/]/).includes('..')) throw new Error(`Component ${id} asset target must stay inside the project.`);
    }
  }
  for (const [id, profile] of Object.entries(manifest.profiles)) {
    if (!profile.source || !profile.source.startsWith('profiles/')) throw new Error(`Profile ${id} has an invalid source.`);
    for (const dependency of profile.requires ?? []) if (!manifest.profiles[dependency]) throw new Error(`Profile ${id} requires unknown profile ${dependency}.`);
  }
  return { manifest, lock };
}

export async function presetComponents(name = 'developer') {
  const { manifest } = await validateCatalog();
  if (!manifest.presets[name]) throw new Error(`Unknown preset: ${name}`);
  return manifest.presets[name];
}
