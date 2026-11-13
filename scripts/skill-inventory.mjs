import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function skillFrontmatterBytes(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match ? Buffer.byteLength(match[1], 'utf8') : 0;
}

export function allowsImplicitInvocation(policyContent = '') {
  return !/^\s*allow_implicit_invocation:\s*false\s*$/mi.test(policyContent);
}

async function skillMetadata(skillDirectory, name) {
  const skillPath = join(skillDirectory, 'SKILL.md');
  const [content, policy] = await Promise.all([
    readFile(skillPath, 'utf8'),
    readFile(join(skillDirectory, 'agents', 'openai.yaml'), 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return '';
      throw error;
    })
  ]);
  return { name, implicit: allowsImplicitInvocation(policy), frontmatterBytes: skillFrontmatterBytes(content) };
}

function summarize(source, skills) {
  return {
    source,
    total: skills.length,
    implicit: skills.filter((skill) => skill.implicit).length,
    implicitFrontmatterBytes: skills.filter((skill) => skill.implicit).reduce((total, skill) => total + skill.frontmatterBytes, 0),
    skills
  };
}

export async function catalogSkillInventory({ root = repositoryRoot } = {}) {
  const catalog = JSON.parse(await readFile(join(root, 'catalog', 'codex-kit.json'), 'utf8'));
  const assets = catalog.components?.['base-policy']?.globalAssets;
  if (!Array.isArray(assets)) throw new Error('Catalog base-policy globalAssets are missing.');
  const skills = await Promise.all(assets.map(({ source, target }) => skillMetadata(
    join(root, source),
    target.split('/').at(-1) || source.split('/').at(-1)
  )));
  return summarize('catalog', skills);
}

export async function homeSkillInventory(home) {
  const skillsRoot = join(resolve(home), 'skills');
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const skills = (await Promise.all(entries
    .filter((entry) => !entry.name.startsWith('.') && (entry.isDirectory() || entry.isSymbolicLink()))
    .map(async (entry) => {
      const skillDirectory = join(skillsRoot, entry.name);
      try {
        if (!(await stat(skillDirectory)).isDirectory()) return null;
        return await skillMetadata(skillDirectory, entry.name);
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
        throw error;
      }
    }))).filter(Boolean).sort((left, right) => left.name.localeCompare(right.name));
  return summarize('home', skills);
}

async function main(args) {
  if (args.length === 0) return catalogSkillInventory();
  if (args.length === 2 && args[0] === '--home') return homeSkillInventory(args[1]);
  throw new Error('Usage: node scripts/skill-inventory.mjs [--home PATH]');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (inventory) => process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`),
    (error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
  );
}
