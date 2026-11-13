import spawn from 'cross-spawn';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { action } from './util.mjs';

export function runtimeSkillInventory({ root = process.cwd(), home, spawnProcess = spawn, timeoutMs = 30_000 } = {}) {
  root = resolve(root);
  return new Promise((resolveInventory, reject) => {
    const child = spawnProcess('codex', ['app-server', '--stdio'], {
      cwd: root, env: { ...process.env, ...(home ? { CODEX_HOME: home } : {}) }, stdio: ['pipe', 'pipe', 'pipe'], shell: false
    });
    const lines = createInterface({ input: child.stdout });
    let finished = false;
    let receivedBytes = 0;
    let pluginErrors = [];
    let stderrTail = '';
    child.stderr.on('data', (chunk) => { stderrTail = (stderrTail + chunk.toString()).slice(-2048); });
    const finish = (error, result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      lines.close();
      child.stdin.end();
      child.kill();
      if (error) reject(error); else resolveInventory(result);
    };
    const timer = setTimeout(() => finish(new Error('Codex skill inventory timed out.')), timeoutMs);
    const send = (message) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
    child.on('error', (error) => finish(error));
    child.stdin.on('error', (error) => finish(error));
    child.on('close', (code) => {
      const blocked = /read-only file system|permission denied|operation not permitted|failed to initialize sqlite state runtime/i.test(stderrTail);
      finish(new Error(blocked
        ? 'Codex native inventory could not initialize local state. If sandbox access was denied, retry this same skill search command with narrow approval for Codex state/cache access.'
        : `Codex skill inventory closed before replying (exit ${code}).`));
    });
    lines.on('line', (line) => {
      if (finished || !line.trim()) return;
      receivedBytes += Buffer.byteLength(line);
      if (receivedBytes > 4 * 1024 * 1024) return finish(new Error('Codex skill inventory exceeded the response limit.'));
      let message;
      try { message = JSON.parse(line); }
      catch { return finish(new Error('Codex skill inventory returned invalid JSON.')); }
      if (![1, 2, 3].includes(message.id)) return;
      if (message.error) return finish(new Error(`Codex skill inventory request failed (code ${message.error.code ?? 'unknown'}).`));
      if (message.id === 1) {
        send({ method: 'initialized', params: {} });
        // Initialize plugin auth/catalog state before skills/list; the bare skills endpoint omits remote roots.
        send({ id: 2, method: 'plugin/installed', params: { cwds: [root] } });
      } else if (message.id === 2) {
        if (!Array.isArray(message.result?.marketplaceLoadErrors)) return finish(new Error('Codex returned an invalid plugin inventory.'));
        pluginErrors = message.result.marketplaceLoadErrors;
        send({ id: 3, method: 'skills/list', params: { cwds: [root], forceReload: true } });
      } else {
        const row = message.result?.data?.find((entry) => entry.cwd === root);
        if (!row || !Array.isArray(row.skills) || !Array.isArray(row.errors)) return finish(new Error('Codex returned an invalid skill inventory.'));
        finish(null, { ...row, errors: [...pluginErrors, ...row.errors] });
      }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'codex-kit', version: '0.3.0-beta.1' }, capabilities: {} } });
  });
}

async function permitsImplicitInvocation(path) {
  let metadata;
  try { metadata = await readFile(join(dirname(path), 'agents', 'openai.yaml'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return true; throw error; }
  return !/^\s*allow_implicit_invocation:\s*false\s*(?:#.*)?$/mi.test(metadata);
}

export async function searchSkills({ query, name, root = process.cwd(), home, catalog } = {}) {
  if (Boolean(query?.trim()) === Boolean(name?.trim())) throw new Error('Use one of --query TEXT or --name NAME.');
  const terms = (query ?? name).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!terms.length) throw new Error('Skill lookup needs a name or topic words.');
  catalog ??= await runtimeSkillInventory({ root, home });
  if (!Array.isArray(catalog.skills) || !Array.isArray(catalog.errors)) throw new Error('Invalid skill catalog.');
  const candidates = [];
  for (const skill of catalog.skills) {
    if (!skill.enabled) continue;
    if (typeof skill.name !== 'string' || typeof skill.description !== 'string' || typeof skill.path !== 'string' || !isAbsolute(skill.path)) throw new Error('Invalid skill metadata.');
    if (name && skill.name !== name.trim()) continue;
    const lowerName = skill.name.toLowerCase();
    const description = skill.description.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (lowerName.includes(term) ? 10 : description.includes(term) ? 1 : 0), 0);
    if (!score) continue;
    const implicit = await permitsImplicitInvocation(skill.path);
    if (!name && !implicit) continue;
    const leaf = lowerName.split(':').at(-1);
    const entryBonus = terms.some((term) => leaf === term || leaf === `${term}-use`) ? 20 : 0;
    candidates.push({ name: skill.name, description: [...skill.description].slice(0, 180).join(''), path: skill.path, scope: skill.scope, implicit, score: score + entryBonus });
  }
  candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  const skills = candidates.slice(0, 5).map(({ score, ...skill }) => skill);
  const errors = catalog.errors.length;
  const result = {
    status: errors ? 'partial' : 'ok', matched: candidates.length, skills,
    ...(errors ? { warning: `Codex reported ${errors} skill-loading errors; inventory is incomplete.` } : {})
  };
  Object.defineProperty(result, 'actions', { value: skills.map((skill) => action('unchanged', skill.name, `${skill.description} (${skill.path})`)) });
  return result;
}
