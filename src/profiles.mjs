import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const sourceExtensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.dart', '.java', '.kt', '.py', '.go', '.rs']);

export async function projectInventory(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const names = entries.map((entry) => entry.name);
  const sourceCount = await countSources(root, 0);
  const packageDirs = entries.filter((entry) => entry.isDirectory() && /^(apps|packages|services|modules)$/i.test(entry.name)).length;
  return { names, sourceCount, packageDirs, monorepo: names.includes('pnpm-workspace.yaml') || names.includes('turbo.json') || names.includes('nx.json') || packageDirs >= 3 };
}

async function countSources(root, depth) {
  if (depth > 4) return 0;
  let entries = [];
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return 0; }
  let count = 0;
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'build' || entry.name === '.next') continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) count += await countSources(path, depth + 1);
    else if (sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf('.')))) count += 1;
  }
  return count;
}

export async function detectProfiles(root) {
  const has = (name) => existsSync(join(root, name));
  const profiles = [];
  if (has('pubspec.yaml')) profiles.push('flutter');
  if (has('pom.xml') || has('build.gradle') || has('build.gradle.kts')) profiles.push('quarkus');
  if (has('nuxt.config.ts') || has('nuxt.config.js') || has('nuxt.config.mjs')) profiles.push('nuxt');
  if (has('package.json')) profiles.push('node');
  if (!profiles.length) profiles.push('generic');
  const inventory = await projectInventory(root);
  return { profiles, inventory, graphifyRecommended: inventory.monorepo || inventory.sourceCount >= 300 || inventory.packageDirs >= 3 };
}

export async function projectName(root) {
  try { const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')); return pkg.name || root.split('/').pop(); }
  catch { return root.split('/').pop(); }
}
