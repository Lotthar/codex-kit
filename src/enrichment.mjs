import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { kitRoot, validateCatalog } from './manifest.mjs';
import { run } from './util.mjs';

export function sanitizedInventory({ profiles, components, graphifyRecommended, sourceCount }) {
  return { profiles, components, graphifyRecommended: Boolean(graphifyRecommended), sourceCount: Math.min(Number(sourceCount) || 0, 10000) };
}

export function validateProposal(value, allowedIds) {
  if (!value || typeof value !== 'object' || typeof value.summary !== 'string' || value.summary.length > 1000 || !Array.isArray(value.recommendations) || value.recommendations.length > 12) throw new Error('Invalid enrichment proposal.');
  for (const recommendation of value.recommendations) if (!allowedIds.has(recommendation.id) || typeof recommendation.reason !== 'string' || recommendation.reason.length > 300) throw new Error('Invalid enrichment recommendation.');
  return value;
}

export async function enrich(inventory) {
  const temporary = await mkdtemp(join(tmpdir(), 'codex-kit-enrich-'));
  const output = join(temporary, 'proposal.json');
  const schema = join(kitRoot, 'schemas', 'enrichment.schema.json');
  const { manifest } = await validateCatalog();
  const prompt = `Return a JSON Codex Kit recommendation. Do not propose file edits or commands. Inventory: ${JSON.stringify(sanitizedInventory(inventory))}`;
  try {
    const result = run('codex', ['exec', '--ephemeral', '--sandbox', 'read-only', '--ignore-user-config', '--ignore-rules', '--output-schema', schema, '--output-last-message', output, '-'], { cwd: temporary, timeout: 60_000, input: prompt });
    if (result.status !== 0) return { available: false, reason: result.stderr.trim() || result.error || 'codex exec failed' };
    return { available: true, proposal: validateProposal(JSON.parse(await readFile(output, 'utf8')), new Set(Object.keys(manifest.components))) };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
