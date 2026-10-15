import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import spawn from 'cross-spawn';
import { copyTracked, beginTransaction, finishTransaction, removeTracked, replaceTracked, rollbackTransaction, withLock, writeTracked } from './transaction.mjs';
import { mergeManagedBlock } from './managed.mjs';
import { action, exists, readJson } from './util.mjs';
import { readText } from './platform.mjs';
import { codexHome } from './global.mjs';
import { kitRoot } from './manifest.mjs';
import { provisionReaToolchain, reaToolchainPlan, reaTreeHash, rejectReaLinks } from './rea-toolchain.mjs';

const MCP_START = '# codex-kit:rea:mcp:start';
const MCP_END = '# codex-kit:rea:mcp:end';
const POLICY_SCOPE = 'rea';
const SKILL_NAME = 'reverse-engineer-anything';
const digest = (text) => createHash('sha256').update(text).digest('hex');
const statePath = (home) => join(home, '.codex-kit', 'rea.json');
const configPath = (home) => join(home, 'config.toml');
const policyPath = (home) => join(home, 'AGENTS.md');
const agentSkillPath = (userHome) => join(userHome, '.agents', 'skills', SKILL_NAME);
const legacySkillPath = (userHome) => join(userHome, '.codex', 'skills', SKILL_NAME);

function mcpBounds(text) {
  const start = text.indexOf(MCP_START);
  const end = text.indexOf(MCP_END);
  if (start === -1 && end === -1) return null;
  if (start === -1 || end === -1 || end < start || text.indexOf(MCP_START, start + MCP_START.length) !== -1 || text.indexOf(MCP_END, end + MCP_END.length) !== -1) throw new Error('Conflicting REA MCP markers; repair them manually.');
  const after = end + MCP_END.length;
  const newline = text.slice(after).match(/^\r?\n/)?.[0] ?? '';
  return { start, end: after + newline.length, block: text.slice(start, after) };
}

function hasUnownedReaMcp(text) {
  const owned = mcpBounds(text);
  const outside = owned ? `${text.slice(0, owned.start)}${text.slice(owned.end)}` : text;
  if (/^\s*\[\s*["']?mcp_servers["']?\s*\.\s*["']?rea["']?\s*(?:\.|\])/mi.test(outside)) return true;
  if (/^\s*mcp_servers\s*\.\s*rea\s*=/mi.test(outside)) return true;
  const table = outside.match(/^\s*\[\s*["']?mcp_servers["']?\s*\]\s*([\s\S]*?)(?=^\s*\[|$)/mi)?.[1] ?? '';
  return /^\s*["']?rea["']?\s*=/mi.test(table);
}

function hasMcpTailOverride(text) {
  const bounds = mcpBounds(text);
  if (!bounds) return false;
  const tail = text.slice(bounds.end).match(/^([\s\S]*?)(?=^\s*\[|$)/m)?.[1] ?? '';
  return /^\s*(?:[A-Za-z0-9_-]+|"[^"]+"|'[^']+')\s*=/m.test(tail);
}

function renderMcp(paths) {
  const env = Object.entries(paths.env ?? {}).sort(([left], [right]) => left.localeCompare(right));
  if (!paths.node || !paths.cli || env.some(([, value]) => typeof value !== 'string')) throw new Error('Invalid REA toolchain paths.');
  return `${MCP_START}\n[mcp_servers.rea]\ncommand = ${JSON.stringify(paths.node)}\nargs = [${JSON.stringify(paths.cli)}, "mcp"]\nstartup_timeout_sec = 30\ntool_timeout_sec = 600\n[mcp_servers.rea.env]\n${env.map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join('\n')}\n${MCP_END}`;
}

function mergeMcp(text, block) {
  const bounds = mcpBounds(text);
  if (!bounds) return `${text}${text && !text.endsWith('\n') ? '\n' : ''}${text.trim() ? '\n' : ''}${block}\n`;
  return `${text.slice(0, bounds.start)}${block}\n${text.slice(bounds.end)}`;
}

function removeMcp(text, expectedHash) {
  const bounds = mcpBounds(text);
  if (!bounds) return { text, changed: false, conflict: false };
  if (digest(bounds.block) !== expectedHash) return { text, changed: false, conflict: true };
  return { text: `${text.slice(0, bounds.start)}${text.slice(bounds.end)}`, changed: true, conflict: false };
}

function policyBlock(text) {
  const start = '<!-- codex-kit:rea:start -->';
  const end = '<!-- codex-kit:rea:end -->';
  const first = text.indexOf(start);
  const last = text.indexOf(end);
  if (first === -1 && last === -1) return null;
  if (first === -1 || last === -1 || last < first || text.indexOf(start, first + start.length) !== -1 || text.indexOf(end, last + end.length) !== -1) throw new Error('Conflicting REA policy markers; repair them manually.');
  return text.slice(first, last + end.length);
}

function removePolicy(text, expectedHash) {
  const block = policyBlock(text);
  if (!block) return { text, changed: false, conflict: false };
  if (digest(block) !== expectedHash) return { text, changed: false, conflict: true };
  const start = text.indexOf(block);
  const after = start + block.length;
  const newline = text.slice(after).match(/^\r?\n/)?.[0] ?? '';
  return { text: `${text.slice(0, start)}${text.slice(after + newline.length)}`, changed: true, conflict: false };
}

function validState(value, home) {
  return value?.schemaVersion === 1
    && ['mcp', 'policy', 'skill', 'toolchain'].every((key) => /^[a-f0-9]{64}$/.test(value[key]?.hash ?? ''))
    && ownedToolchainRoot(value.toolchain.root, home);
}

function ownedToolchainRoot(root, home) {
  return typeof root === 'string' && dirname(resolve(root)) === resolve(home, '.codex-kit', 'rea', 'tools');
}

async function call(runner, command, args, options) { return await runner(command, args, options); }

async function rollbackRea(home, homeTransaction, userHome, userTransaction, original) {
  const errors = [original];
  for (const [root, transaction] of [[home, homeTransaction], [userHome, userTransaction]]) {
    if (!transaction) continue;
    try {
      const receipt = await finishTransaction(transaction, 'failed');
      await rollbackTransaction(root, receipt.id);
    } catch (error) { errors.push(error); }
  }
  if (errors.length > 1) throw new AggregateError(errors, 'REA operation failed and rollback was incomplete; inspect the transaction receipts.');
  throw original;
}

function codexRunner(command, args, options = {}) {
  const result = spawn.sync(command, args, { cwd: options.cwd, env: options.env, encoding: 'utf8', shell: false, timeout: options.timeout ?? 30_000 });
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error?.message };
}

function reaMcpEntry(stdout) {
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { throw new Error('codex mcp list did not return JSON.'); }
  const entries = Array.isArray(parsed) ? parsed : parsed?.mcp_servers;
  if (!Array.isArray(entries)) throw new Error('codex mcp list returned an unexpected catalog.');
  return entries.find((entry) => entry.name === 'rea');
}

function matchesMcp(entry, expected) {
  const transport = entry?.transport;
  return entry?.enabled === true && transport?.type === 'stdio'
    && transport.command === expected.command
    && JSON.stringify(transport.args) === JSON.stringify(expected.args)
    && !transport.cwd && !(transport.env_vars?.length)
    && entry.startup_timeout_sec === expected.startup_timeout_sec
    && entry.tool_timeout_sec === expected.tool_timeout_sec
    && Object.keys(transport.env ?? {}).length === Object.keys(expected.env).length
    && Object.entries(expected.env).every(([key, value]) => transport.env?.[key] === value);
}

async function validateInstalledMcp(runner, home, expected) {
  const checked = await call(runner, 'codex', ['mcp', 'list', '--json'], { env: { ...process.env, CODEX_HOME: home } });
  if (checked?.status !== 0 || !matchesMcp(reaMcpEntry(checked.stdout), expected)) throw new Error('Codex rejected the installed REA MCP identity.');
}

async function preflight({ home, userHome, runner, validateMcp = false }) {
  const config = await readText(configPath(home));
  const state = await readJson(statePath(home), null);
  const actions = [];
  if (hasUnownedReaMcp(config)) actions.push(action('conflict', 'configure REA MCP', 'An existing unowned rea MCP configuration was preserved.'));
  if (hasMcpTailOverride(config)) actions.push(action('conflict', 'configure REA MCP', 'An unmanaged REA environment override was preserved.'));
  const skill = agentSkillPath(userHome);
  if (state && !validState(state, home)) actions.push(action('conflict', 'read REA receipt', 'The ownership receipt is invalid; existing files were preserved.'));
  if (mcpBounds(config) && (!validState(state, home) || digest(mcpBounds(config).block) !== state.mcp.hash)) actions.push(action('conflict', 'configure REA MCP', 'The existing managed block was modified outside its receipt.'));
  if (policyBlock(await readText(policyPath(home))) && (!validState(state, home) || digest(policyBlock(await readText(policyPath(home)))) !== state.policy.hash)) actions.push(action('conflict', 'configure REA workflow policy', 'The existing managed block was modified outside its receipt.'));
  if (exists(skill) && (!validState(state, home) || await reaTreeHash(skill) !== state.skill.hash)) actions.push(action('conflict', `provision ${SKILL_NAME}`, 'An existing user skill was preserved.'));
  if (exists(legacySkillPath(userHome))) actions.push(action('conflict', `check legacy ${SKILL_NAME} skill`, 'An existing legacy Codex skill was preserved.'));
  if (validateMcp && !actions.some((item) => item.state === 'conflict')) {
    const checked = await call(runner, 'codex', ['mcp', 'list', '--json'], { env: { ...process.env, CODEX_HOME: home } });
    if (!checked || checked.status !== 0) actions.push(action('failed', 'validate Codex MCP configuration', 'codex mcp list --json failed; no changes were made.'));
    else {
      const owned = mcpBounds(config);
      try {
        const entry = reaMcpEntry(checked.stdout ?? '');
        if (entry && (!owned || !validState(state, home) || digest(owned.block) !== state.mcp.hash || (state.mcp.identity && !matchesMcp(entry, state.mcp.identity)))) actions.push(action('conflict', 'configure REA MCP', 'Codex reports an unowned or modified rea MCP.'));
        else actions.push(action('unchanged', 'validate Codex MCP configuration', 'Codex accepted the existing configuration.'));
      } catch (error) { actions.push(action('failed', 'validate Codex MCP configuration', error.message)); }
    }
  }
  return { config, actions };
}

async function writeSetup(home, userHome, source, state, render, runner) {
  const sameRoot = home === userHome;
  let homeReceipt;
  let userReceipt;
  let applied = false;
  const apply = async () => {
    const userTransaction = sameRoot ? null : await beginTransaction(userHome, 'global');
    const homeTransaction = await beginTransaction(home, 'global');
    try {
      const current = await render();
      if (!current) {
        await finishTransaction(homeTransaction, 'cancelled');
        if (userTransaction) await finishTransaction(userTransaction, 'cancelled');
        return null;
      }
      const skillTransaction = userTransaction ?? homeTransaction;
      if (exists(agentSkillPath(userHome))) await replaceTracked(skillTransaction, source, agentSkillPath(userHome));
      else await copyTracked(skillTransaction, source, agentSkillPath(userHome));
      await writeTracked(homeTransaction, configPath(home), current.config);
      await writeTracked(homeTransaction, policyPath(home), current.policy);
      await writeTracked(homeTransaction, statePath(home), `${JSON.stringify(state, null, 2)}\n`);
      await validateInstalledMcp(runner, home, state.mcp.identity);
      homeReceipt = await finishTransaction(homeTransaction);
      if (userTransaction) userReceipt = await finishTransaction(userTransaction);
      applied = true;
    } catch (error) {
      await rollbackRea(home, homeTransaction, userHome, userTransaction, error);
    }
  };
  if (sameRoot) await withLock(home, apply);
  else await withLock(home, () => withLock(userHome, apply));
  return applied ? { homeReceipt, userReceipt } : null;
}

export async function setupRea({ home = codexHome(), execute = false, allowNetwork = false, userHome = homedir(), runner = codexRunner, provision = provisionReaToolchain } = {}) {
  await Promise.all([home, configPath(home), policyPath(home), statePath(home), agentSkillPath(userHome)].map((path) => rejectReaLinks(path)));
  const preflightResult = await preflight({ home, userHome, runner, validateMcp: execute });
  if (preflightResult.actions.some((item) => item.state === 'conflict')) return { status: 'conflict', home, actions: preflightResult.actions };
  if (preflightResult.actions.some((item) => item.state === 'failed')) return { status: 'partial', home, actions: preflightResult.actions };
  if (!execute) {
    const toolchain = await reaToolchainPlan({ home });
    return { status: 'planned', home, toolchain, actions: [...preflightResult.actions, action('planned', 'provision REA toolchain', allowNetwork ? `download locked artifacts if needed into ${toolchain.paths.root}` : `uses only cached locked artifacts in ${toolchain.paths.root}; pass --allow-network to download`), action('planned', 'configure REA MCP', `${configPath(home)} launches ${toolchain.paths.node} ${toolchain.paths.cli} mcp`), action('planned', 'install REA workflow policy', policyPath(home)), action('planned', `install ${SKILL_NAME}`, agentSkillPath(userHome)), action('planned', 'write REA receipt', statePath(home))] };
  }
  const toolchain = await provision({ home, allowNetwork });
  if (!ownedToolchainRoot(toolchain.paths?.root, home)) throw new Error('REA toolchain root must stay inside its owned tools directory.');
  const block = renderMcp(toolchain.paths);
  const policySource = await readText(join(kitRoot, 'policies', 'rea-workflow.md'));
  if (!policySource) throw new Error('REA workflow policy is unavailable.');
  const mergedPolicy = mergeManagedBlock(await readText(policyPath(home)), `<!-- codex-kit:rea:start -->\n${policySource.trim()}\n<!-- codex-kit:rea:end -->`, POLICY_SCOPE);
  const skillHash = await reaTreeHash(toolchain.paths.skillSource);
  const identity = { command: toolchain.paths.node, args: [toolchain.paths.cli, 'mcp'], env: toolchain.paths.env ?? {}, startup_timeout_sec: 30, tool_timeout_sec: 600 };
  const state = { schemaVersion: 1, version: toolchain.version, toolchain: { root: toolchain.paths.root, hash: await reaTreeHash(toolchain.paths.root), artifacts: toolchain.artifacts ?? [] }, mcp: { hash: digest(block), identity }, policy: { hash: digest(policyBlock(mergedPolicy)) }, skill: { name: SKILL_NAME, hash: skillHash }, updatedAt: new Date().toISOString() };
  let conflict;
  const receipts = await writeSetup(home, userHome, toolchain.paths.skillSource, state, async () => {
    const rechecked = await preflight({ home, userHome, runner, validateMcp: true });
    if (rechecked.actions.some((item) => ['conflict', 'failed'].includes(item.state))) { conflict = rechecked; return null; }
    const updatedPolicy = mergeManagedBlock(await readText(policyPath(home)), `<!-- codex-kit:rea:start -->\n${policySource.trim()}\n<!-- codex-kit:rea:end -->`, POLICY_SCOPE);
    state.policy.hash = digest(policyBlock(updatedPolicy));
    return { config: mergeMcp(rechecked.config, block), policy: updatedPolicy };
  }, runner);
  if (!receipts) return { status: conflict.actions.some((item) => item.state === 'conflict') ? 'conflict' : 'partial', home, actions: conflict.actions };
  return { status: 'ok', home, transactionId: receipts.homeReceipt?.id, actions: [...preflightResult.actions, action('changed', 'provision REA toolchain', toolchain.version), action('changed', 'configure REA lifecycle', 'MCP block, policy block, skill, and receipt')] };
}

export async function reaStatus({ home = codexHome(), userHome = homedir() } = {}) {
  await rejectReaLinks(statePath(home));
  const state = await readJson(statePath(home), null);
  const actions = [];
  if (!validState(state, home)) return { status: 'partial', home, actions: [action('warning', 'read REA receipt', 'REA is not installed or its receipt is invalid.')] };
  await Promise.all([configPath(home), policyPath(home), statePath(home), agentSkillPath(userHome), state.toolchain.root].map((path) => rejectReaLinks(path)));
  const config = await readText(configPath(home));
  const policyText = await readText(policyPath(home));
  const mcp = mcpBounds(config)?.block;
  const policy = policyBlock(policyText);
  if (mcp && !hasUnownedReaMcp(config) && !hasMcpTailOverride(config) && digest(mcp) === state.mcp.hash) actions.push(action('unchanged', 'REA MCP configuration', 'managed block matches receipt')); else actions.push(action('warning', 'REA MCP configuration', 'missing or modified'));
  if (policy && digest(policy) === state.policy.hash) actions.push(action('unchanged', 'REA workflow policy', 'managed block matches receipt')); else actions.push(action('warning', 'REA workflow policy', 'missing or modified'));
  const skill = agentSkillPath(userHome);
  if (exists(skill) && await reaTreeHash(skill) === state.skill.hash) actions.push(action('unchanged', SKILL_NAME, 'managed skill matches receipt')); else actions.push(action('warning', SKILL_NAME, 'missing or modified'));
  if (exists(state.toolchain.root) && await reaTreeHash(state.toolchain.root) === state.toolchain.hash) actions.push(action('unchanged', 'REA toolchain', 'locked toolchain tree matches receipt')); else actions.push(action('warning', 'REA toolchain', 'missing or modified'));
  return { status: actions.some((item) => item.state === 'warning') ? 'partial' : 'ok', home, version: state.version, actions };
}

async function removeReaLocked({ home, execute, userHome, runner }) {
  const state = await readJson(statePath(home), null);
  if (!validState(state, home)) return { status: 'conflict', home, actions: [action('conflict', 'remove REA lifecycle', 'The REA receipt is missing or invalid; managed files were preserved.')] };
  await Promise.all([configPath(home), policyPath(home), agentSkillPath(userHome), state.toolchain.root].map((path) => rejectReaLinks(path)));
  const config = await readText(configPath(home));
  const policy = await readText(policyPath(home));
  const configRemoval = hasUnownedReaMcp(config) || hasMcpTailOverride(config) ? { text: config, changed: false, conflict: true } : removeMcp(config, state.mcp.hash);
  const policyRemoval = removePolicy(policy, state.policy.hash);
  const skill = agentSkillPath(userHome);
  const skillConflict = exists(skill) && await reaTreeHash(skill) !== state.skill.hash;
  const toolchainExists = exists(state.toolchain.root);
  const toolchainConflict = toolchainExists && await reaTreeHash(state.toolchain.root) !== state.toolchain.hash;
  const actions = [
    action(configRemoval.conflict ? 'conflict' : configRemoval.changed ? 'planned' : 'unchanged', 'remove REA MCP configuration', configRemoval.conflict ? 'managed block was modified' : ''),
    action(policyRemoval.conflict ? 'conflict' : policyRemoval.changed ? 'planned' : 'unchanged', 'remove REA workflow policy', policyRemoval.conflict ? 'managed block was modified' : ''),
    action(skillConflict ? 'conflict' : exists(skill) ? 'planned' : 'unchanged', `remove ${SKILL_NAME}`, skillConflict ? 'managed skill was modified' : ''),
    action(toolchainConflict ? 'conflict' : toolchainExists ? 'planned' : 'unchanged', 'remove installed REA toolchain', toolchainConflict ? 'modified installation preserved' : 'cached downloads and investigation evidence are retained')
  ];
  if (!execute) return { status: actions.some((item) => item.state === 'conflict') ? 'conflict' : 'planned', home, actions };
  if (configRemoval.changed && state.mcp.identity) await validateInstalledMcp(runner, home, state.mcp.identity);
  const apply = async () => {
    const homeTransaction = await beginTransaction(home, 'global');
    const userTransaction = home === userHome ? null : await beginTransaction(userHome, 'global');
    try {
      if (configRemoval.changed) await writeTracked(homeTransaction, configPath(home), configRemoval.text);
      if (policyRemoval.changed) await writeTracked(homeTransaction, policyPath(home), policyRemoval.text);
      if (!skillConflict && exists(skill)) await removeTracked(userTransaction ?? homeTransaction, skill);
      const partial = actions.some((item) => item.state === 'conflict');
      if (!partial && toolchainExists) await removeTracked(homeTransaction, state.toolchain.root);
      if (!partial) await removeTracked(homeTransaction, statePath(home));
      if (configRemoval.changed) {
        const checked = await call(runner, 'codex', ['mcp', 'list', '--json'], { env: { ...process.env, CODEX_HOME: home } });
        if (checked?.status !== 0 || reaMcpEntry(checked.stdout)) throw new Error('Codex rejected the REA removal; rolling back.');
      }
      const homeReceipt = await finishTransaction(homeTransaction);
      if (userTransaction) await finishTransaction(userTransaction);
      return { status: partial ? 'partial' : 'ok', home, transactionId: homeReceipt.id, actions: actions.map((item) => item.state === 'planned' ? { ...item, state: 'changed' } : item) };
    } catch (error) {
      await rollbackRea(home, homeTransaction, userHome, userTransaction, error);
    }
  };
  return apply();
}

export async function removeRea({ home = codexHome(), execute = false, userHome = homedir(), runner = codexRunner } = {}) {
  await Promise.all([statePath(home), agentSkillPath(userHome)].map((path) => rejectReaLinks(path)));
  const remove = () => removeReaLocked({ home, execute, userHome, runner });
  if (!execute) return remove();
  return home === userHome ? withLock(home, remove) : withLock(home, () => withLock(userHome, remove));
}
