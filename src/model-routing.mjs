import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const modelRoutingStatePath = (home) => join(home, '.codex-kit', 'model-routing.json');

const roles = [
  { id: 'orchestrator', target: 'codex-kit-orchestrator.config.toml', candidates: ['gpt-5.6-sol', 'gpt-5.5', 'gpt-5.4'], effort: 'high' },
  { id: 'mapper', target: 'agents/codex_kit_mapper.toml', candidates: ['gpt-5.6-terra', 'gpt-5.5', 'gpt-5.4'], effort: 'medium', sandbox: 'read-only', description: 'Maps bounded repository context and returns concise evidence.' },
  { id: 'worker', target: 'agents/codex_kit_worker.toml', candidates: ['gpt-5.6-terra', 'gpt-5.5', 'gpt-5.4'], effort: 'medium', sandbox: 'workspace-write', description: 'Implements one bounded, parent-owned code or test slice.' },
  { id: 'reviewer', target: 'agents/codex_kit_reviewer.toml', candidates: ['gpt-5.6-terra', 'gpt-5.5', 'gpt-5.4'], effort: 'high', sandbox: 'read-only', description: 'Reviews a focused diff for correctness, risk, and missing validation.' },
  { id: 'support', target: 'agents/codex_kit_support.toml', candidates: ['gpt-5.6-luna', 'gpt-5.4', 'gpt-5.5'], effort: 'low', sandbox: 'read-only', description: 'Performs bounded evidence gathering, log analysis, or documentation checks.' }
];

const quote = (value) => JSON.stringify(value);
const hash = (content) => createHash('sha256').update(content).digest('hex');

export function parseModelCatalog(output) {
  try {
    const parsed = JSON.parse(String(output).slice(String(output).indexOf('{')));
    if (!Array.isArray(parsed.models)) throw new Error('missing models');
    return parsed.models.filter((model) => typeof model?.slug === 'string' && model.visibility !== 'hidden');
  } catch { return null; }
}

function select(role, catalog) {
  if (!catalog) return { model: null, effort: null, source: 'inherit' };
  const model = role.candidates.map((candidate) => catalog.find((item) => item.slug === candidate)).find(Boolean);
  if (!model) return { model: null, effort: null, source: 'inherit' };
  const supported = new Set((model.supported_reasoning_levels ?? []).map((item) => item.effort));
  return { model: model.slug, effort: supported.has(role.effort) ? role.effort : null, source: 'catalog' };
}

function agentInstructions(role) {
  return `You are Codex Kit's ${role.id} role.\n\n- Work only on the bounded task delegated by the parent.\n- Follow repository instructions and do not create a recursive agent tree.\n- Return concise evidence and uncertainties to the parent.\n- The parent owns final decisions, integration, and the user-facing result.`;
}

function render(role, selection) {
  const model = selection.model ? `model = ${quote(selection.model)}\n` : '';
  const effort = selection.effort ? `model_reasoning_effort = ${quote(selection.effort)}\n` : '';
  if (role.id === 'orchestrator') return `# Managed by Codex Kit. Refresh with: codex-kit models refresh --yes\n${model}${effort}[agents]\nmax_threads = 6\nmax_depth = 1\ninterrupt_message = true\n`;
  return `# Managed by Codex Kit. Refresh with: codex-kit models refresh --yes\nname = ${quote(`codex_kit_${role.id}`)}\ndescription = ${quote(role.description)}\n${model}${effort}sandbox_mode = ${quote(role.sandbox)}\n\ndeveloper_instructions = \"\"\"\n${agentInstructions(role)}\n\"\"\"\n`;
}

export function resolveModelRouting(catalog) {
  const source = catalog ? 'runtime-catalog' : 'inherit';
  const assets = roles.map((role) => {
    const selection = select(role, catalog);
    const content = render(role, selection);
    return { id: role.id, target: role.target, ...selection, content, hash: hash(content) };
  });
  return { schemaVersion: 1, source, assets };
}

export function routingActions(routing, state = 'planned') {
  return routing.assets.map((asset) => ({
    state,
    label: `provision model role ${asset.id}`,
    detail: asset.model ? `${asset.model}${asset.effort ? ` (${asset.effort})` : ''}` : 'inherit current Codex model',
    scope: 'global',
    reversibility: 'full'
  }));
}

export function routingSummary(routing) {
  return { source: routing.source, roles: routing.assets.map(({ id, target, model, effort, source }) => ({ id, target, model, effort, source })) };
}
