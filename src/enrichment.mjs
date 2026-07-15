import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './util.mjs';

const allowedIds = new Set(['base-policy', 'ponytail', 'ruflo', 'graphify', 'promptx', 'clean-code']);

export function validateProposal(value) {
  if (!value || typeof value !== 'object' || typeof value.summary !== 'string' || !Array.isArray(value.recommendations)) throw new Error('Invalid enrichment proposal.');
  for (const recommendation of value.recommendations) if (!allowedIds.has(recommendation.id) || typeof recommendation.reason !== 'string') throw new Error('Invalid enrichment recommendation.');
  return value;
}

export async function enrich(inventory) {
  const temporary = await mkdtemp(join(tmpdir(), 'codex-kit-enrich-'));
  const output = join(temporary, 'proposal.json');
  const schema = join(temporary, 'schema.json');
  const prompt = `Return a JSON Codex Kit recommendation for this sanitized project inventory. Do not recommend changes outside listed components. Inventory: ${JSON.stringify(inventory)}`;
  const schemaValue = { type: 'object', additionalProperties: false, required: ['summary', 'recommendations'], properties: { summary: { type: 'string' }, recommendations: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'reason'], properties: { id: { type: 'string', enum: [...allowedIds] }, reason: { type: 'string' } } } } } };
  try {
    await writeFile(schema, JSON.stringify(schemaValue));
    const result = run('codex', ['exec', '--ephemeral', '--sandbox', 'read-only', '--ignore-user-config', '--ignore-rules', '--output-schema', schema, '--output-last-message', output, prompt], { cwd: temporary, timeout: 60_000 });
    if (result.status !== 0) return { available: false, reason: result.stderr.trim() || result.error || 'codex exec failed' };
    return { available: true, proposal: validateProposal(JSON.parse(await readFile(output, 'utf8'))) };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
