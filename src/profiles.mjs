import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { kitRoot, validateCatalog } from './manifest.mjs';

const sourceExtensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.dart', '.java', '.kt', '.py', '.go', '.rs']);
const ignored = new Set(['node_modules', '.git', 'build', 'dist', 'target', '.next', '.nuxt', 'coverage', '.venv', 'vendor']);

async function text(path) { try { return (await readFile(path, 'utf8')).toLowerCase(); } catch { return ''; } }
async function packageJson(root) { try { return JSON.parse(await readFile(join(root, 'package.json'), 'utf8')); } catch { return {}; } }
const dependency = (pkg, name) => Boolean(pkg.dependencies?.[name] || pkg.devDependencies?.[name] || pkg.peerDependencies?.[name]);

export async function projectInventory(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const names = entries.map((entry) => entry.name);
  const containers = entries.filter((entry) => entry.isDirectory() && /^(apps|packages|services|modules)$/i.test(entry.name));
  const packageDirs = (await Promise.all(containers.map(async (container) => (await readdir(join(root, container.name), { withFileTypes: true })).filter((entry) => entry.isDirectory()).length))).reduce((sum, value) => sum + value, 0);
  return { names, sourceCount: await countSources(root, 0), packageDirs, monorepo: names.includes('pnpm-workspace.yaml') || names.includes('turbo.json') || names.includes('nx.json') || packageDirs >= 3 };
}

async function countSources(root, depth) {
  if (depth > 6) return 0;
  let entries = [];
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return 0; }
  let count = 0;
  for (const entry of entries) {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) count += await countSources(path, depth + 1);
    else if (sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf('.')))) count += 1;
  }
  return count;
}

export async function detectProfiles(root) {
  const has = (name) => existsSync(join(root, name));
  const pkg = await packageJson(root);
  const javaFiles = ['pom.xml', 'build.gradle', 'build.gradle.kts'].filter(has);
  const javaText = (await Promise.all(javaFiles.map((name) => text(join(root, name))))).join('\n');
  const profiles = [];
  if (has('pubspec.yaml')) profiles.push('flutter');
  if (javaFiles.length) profiles.push('java');
  if (javaText.includes('spring-boot') || javaText.includes('org.springframework.boot')) profiles.push('spring');
  if (javaText.includes('quarkus')) profiles.push('quarkus');
  if (has('package.json')) profiles.push('node');
  if (has('nuxt.config.ts') || has('nuxt.config.js') || has('nuxt.config.mjs') || dependency(pkg, 'nuxt')) profiles.push('nuxt');
  if (has('angular.json') || dependency(pkg, '@angular/core')) profiles.push('angular');
  if (!profiles.length) profiles.push('generic');
  const inventory = await projectInventory(root);
  return { profiles, inventory, graphifyRecommended: inventory.monorepo || inventory.sourceCount >= 300 || inventory.packageDirs >= 3, frameworkConflict: profiles.includes('spring') && profiles.includes('quarkus') };
}

export async function profileInstructions(profiles) {
  const { manifest } = await validateCatalog();
  const output = [];
  for (const id of profiles) {
    const profile = manifest.profiles[id];
    if (!profile) continue;
    output.push({ id, text: (await readFile(join(kitRoot, profile.source), 'utf8')).trim() });
  }
  return output;
}

export async function projectName(root) { return (await packageJson(root)).name || basename(root); }
