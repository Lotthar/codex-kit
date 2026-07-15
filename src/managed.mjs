import { backup, atomicWrite, exists } from './util.mjs';

export const START = '<!-- codex-kit:managed:start -->';
export const END = '<!-- codex-kit:managed:end -->';

export function renderManagedBlock({ profiles, components }) {
  const profileText = profiles.map((profile) => `- Active profile: \`${profile}\`.`).join('\n');
  const componentText = components.map((component) => `- Enabled component: \`${component}\`.`).join('\n');
  return `${START}\n## Codex Kit\n\nThis block is maintained by Codex Kit. Edit project-specific instructions outside it.\n\n${profileText}\n${componentText}\n\n- Prefer the smallest verified change and follow local repository instructions.\n- Use Ruflo only for persistent coordination across three or more dependent workstreams.\n- Graphify installation, graph builds, and hooks require explicit project consent.\n${END}`;
}

export function mergeManagedBlock(existing, block) {
  const start = existing.indexOf(START);
  const end = existing.indexOf(END);
  if (start === -1 && end === -1) return `${existing.trimEnd()}${existing.trim() ? '\n\n' : ''}${block}\n`;
  if (start === -1 || end === -1 || end < start) throw new Error('Conflicting Codex Kit markers in AGENTS.md; repair them manually.');
  if (existing.indexOf(START, start + START.length) !== -1 || existing.indexOf(END, end + END.length) !== -1) throw new Error('Multiple Codex Kit marker blocks found; refusing to choose one.');
  return `${existing.slice(0, start)}${block}${existing.slice(end + END.length)}`;
}

export async function applyManagedBlock(path, root, block) {
  const original = exists(path) ? await (await import('node:fs/promises')).readFile(path, 'utf8') : '';
  const updated = mergeManagedBlock(original, block);
  if (updated === original) return { changed: false };
  const receipt = await backup(path, root);
  await atomicWrite(path, updated);
  return { changed: true, receipt };
}
