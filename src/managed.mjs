import { detectEol, withEol } from './platform.mjs';

export const markers = (scope = 'project') => ({ start: `<!-- codex-kit:${scope}:start -->`, end: `<!-- codex-kit:${scope}:end -->` });
export const START = markers().start;
export const END = markers().end;

export function renderManagedBlock({ profiles = [], components = [], instructions = [], scope = 'project' }) {
  const pair = markers(scope);
  const profileText = profiles.map((profile) => `- Active profile: \`${profile}\`.`).join('\n');
  const componentText = components.map((component) => `- Project component: \`${component}\`.`).join('\n');
  const instructionText = instructions.map((item) => `### ${item.id}\n\n${item.text}`).join('\n\n');
  return `${pair.start}\n## Codex Kit\n\nThis block is maintained by Codex Kit. Edit project-specific instructions outside it.\n\n${profileText}\n${componentText}\n\n- Follow human-authored repository instructions outside this managed block.\n- Use Ponytail for coding simplicity when the global plugin is available.\n- Use \`$plan-with-subagents\` for non-trivial planning and \`$implement-plan-with-subagents\` for approved plans.\n- Use native Codex subagents for bounded current-task work; use Ruflo only for durable coordination across three or more dependent workstreams.\n- Graphify installation, graph builds, and hooks require explicit project consent.\n${instructionText ? `\n\n${instructionText}\n` : ''}${pair.end}`;
}

export function mergeManagedBlock(existing, block, scope = 'project') {
  const pair = markers(scope);
  const legacy = { start: '<!-- codex-kit:managed:start -->', end: '<!-- codex-kit:managed:end -->' };
  let active = pair;
  let start = existing.indexOf(pair.start);
  let end = existing.indexOf(pair.end);
  if (scope === 'project' && start === -1 && end === -1 && (existing.includes(legacy.start) || existing.includes(legacy.end))) {
    active = legacy;
    start = existing.indexOf(legacy.start);
    end = existing.indexOf(legacy.end);
  }
  const eol = detectEol(existing);
  const normalized = withEol(block, eol);
  if (start === -1 && end === -1) return `${existing.trimEnd()}${existing.trim() ? `${eol}${eol}` : ''}${normalized}${eol}`;
  if (start === -1 || end === -1 || end < start) throw new Error(`Conflicting Codex Kit ${scope} markers; repair them manually.`);
  if (existing.indexOf(active.start, start + active.start.length) !== -1 || existing.indexOf(active.end, end + active.end.length) !== -1) throw new Error(`Multiple Codex Kit ${scope} marker blocks found; refusing to choose one.`);
  return `${existing.slice(0, start)}${normalized}${existing.slice(end + active.end.length)}`;
}
