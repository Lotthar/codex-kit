import { resolve } from 'node:path';
import { brainRegister, loadBrainRegistry } from './brain-registry.mjs';
import { brainInit, brainRemember, deriveProjectKey } from './obsidian.mjs';
import { brainReconcile, brainReconcileStatus } from './brain-reconcile.mjs';
import { applyProject, projectPlan, projectStatus } from './project.mjs';
import { contextStatus } from './context.mjs';
import { action } from './util.mjs';

function atRoot(entry, root) {
  return root && [entry.root, ...(entry.roots ?? [])].filter(Boolean).some((path) => resolve(path) === resolve(root));
}

export async function resolveBrainContext({ home, root = process.cwd(), project }) {
  const registry = await loadBrainRegistry({ home });
  if (project) {
    const entry = registry.projects.find((item) => item.key === project);
    if (!entry) throw new Error('Unknown Brain project. Use brain projects or brain register first.');
    return { root: entry.root || undefined, projectKey: entry.key, entry, registry };
  }
  let local;
  try { local = await projectStatus(root); }
  catch (error) { if (!error.message.includes('require a Git repository')) throw error; }
  const entry = registry.projects.find((item) => atRoot(item, local?.root || root));
  const configured = local?.config?.tools?.obsidian?.projectKey;
  if (entry && configured && entry.key !== configured) throw new Error('Brain registry and project configuration disagree; reconcile the project identity first.');
  return { root: local?.root || entry?.root, projectKey: configured || entry?.key, entry, registry, local };
}

export async function registerProject({ home, root, project, name, externalId, topics, inclusion, execute = false }) {
  let local;
  if (!externalId) {
    root ??= process.cwd();
    try { local = await projectStatus(root); }
    catch (error) { if (!error.message.includes('require a Git repository')) throw error; }
  }
  const registry = await loadBrainRegistry({ home });
  const existing = registry.projects.find((entry) => (project && entry.key === project) || (externalId && entry.externalId === externalId) || atRoot(entry, local?.root || root));
  const configured = local?.config?.tools?.obsidian?.projectKey;
  if (configured && project && configured !== project) throw new Error('Explicit project key conflicts with the repository configuration.');
  const key = configured || project || existing?.key || (local ? await deriveProjectKey({ root: local.root, allocate: execute }) : undefined);
  return brainRegister({ home, key, name: name ?? existing?.name ?? local?.root?.split(/[\\/]/).pop() ?? root?.split(/[\\/]/).pop(), root: local?.root || root, externalId, topics, inclusion, kind: local ? 'git' : existing?.kind || (externalId ? 'external' : 'projectless'), execute });
}

export async function prepareProject({ home, ...options }) {
  const plan = await projectPlan(options);
  if (!plan.components.includes('obsidian-brain')) return plan;
  const registry = await loadBrainRegistry({ home });
  const entry = registry.projects.find((item) => atRoot(item, plan.root));
  const configured = plan.config.tools.obsidian.projectKey;
  if (entry && configured && configured !== entry.key) throw new Error('Brain registry and repository identity conflict.');
  if (entry) plan.config.tools.obsidian.projectKey = entry.key;
  return plan;
}

export async function finishProjectSetup({ home, result, execute = false, runner, reconcile = true }) {
  if (result.status !== 'ok' || !result.components?.includes('obsidian-brain')) return result;
  if (!execute) {
    const registry = await loadBrainRegistry({ home });
    const configuredKey = result.config?.tools?.obsidian?.projectKey;
    const known = registry.projects.find((entry) => entry.key === configuredKey || atRoot(entry, result.root));
    if (known && configuredKey && known.key !== configuredKey) throw new Error('Brain registry and project configuration disagree; reconcile the project identity first.');
    const key = configuredKey || known?.key || null;
    const registration = await brainRegister({ home, key: key ?? undefined, name: known?.name || result.project, root: result.root, kind: 'git', execute: false });
    const inclusion = known?.inclusion ?? 'included';
    const target = { projectKey: key, allocateProjectKeyOnApply: !key, inclusion, namespace: key ? `Projects/${key}/` : null, reconcile };
    const actions = [...result.actions, ...registration.actions];
    if (inclusion !== 'included') {
      actions.push(action('skipped', 'initialize project Brain', `Project is ${inclusion}.`));
      actions.push(action('skipped', 'reconcile Brain indexes', `Project is ${inclusion}.`));
    } else {
      actions.push(action('planned', 'initialize project Brain', key ? `Projects/${key}/` : 'allocate project key and create its namespace on apply'));
      if (reconcile) actions.push(action('planned', 'reconcile Brain indexes', 'refresh generated CodexKit/Brain catalog pages'));
    }
    return { ...result, brainSetup: target, registration, actions };
  }
  const registry = await loadBrainRegistry({ home });
  const key = result.config.tools.obsidian.projectKey;
  const known = registry.projects.find((entry) => entry.key === key);
  const registration = await brainRegister({ home, key, name: known?.name || result.project, root: result.root, kind: 'git', execute: true });
  if (registration.status !== 'ok') return { ...result, status: 'partial', registration, actions: [...result.actions, ...registration.actions] };
  if (registration.project.inclusion !== 'included') return { ...result, registration, actions: [...result.actions, ...registration.actions, action('skipped', 'initialize project Brain', `Project is ${registration.project.inclusion}.`)] };
  const initialized = await brainInit({ home, projectKey: key, execute: true, runner });
  let index;
  if (initialized.status === 'ok' && reconcile) index = await brainReconcile({ home, projects: (await loadBrainRegistry({ home })).projects, scope: 'all', execute: true, runner });
  return { ...result, status: initialized.status === 'ok' && (!index || index.status === 'ok') ? 'ok' : 'partial', registration, brain: initialized, ...(index ? { indexed: index.status === 'ok' } : {}), actions: [...result.actions, ...registration.actions, ...initialized.actions, ...(index?.actions ?? [])] };
}

export async function setupProject({ home, execute = false, runner, ...options }) {
  const plan = await prepareProject({ home, ...options });
  const result = execute ? await applyProject(plan) : plan;
  return finishProjectSetup({ home, result, execute, runner });
}

export async function rememberAndIndex(options) {
  const capture = await brainRemember(options);
  if (!capture.remembered) return capture;
  const registry = await loadBrainRegistry({ home: options.home });
  if (!registry.projects.some((entry) => entry.key === options.projectKey && entry.inclusion === 'included')) {
    return { ...capture, status: 'partial', indexed: false, actions: [...capture.actions, action('recommended', 'register captured project', 'The note was saved. Ensure the project is registered and included, then run brain reconcile; do not repeat capture.')] };
  }
  try {
    const index = await brainReconcile({ home: options.home, projects: registry.projects, scope: 'all', execute: true, runner: options.runner });
    return { ...capture, status: index.status, indexed: index.status === 'ok', actions: [...capture.actions, ...index.actions] };
  } catch (error) {
    return { ...capture, status: 'partial', indexed: false, actions: [...capture.actions, action('failed', 'refresh Brain indexes', `${error.message} The note was saved; retry brain reconcile only.`)] };
  }
}

export async function brainAlignment({ home, root = process.cwd() }) {
  const result = await contextStatus({ home, root });
  const registry = await loadBrainRegistry({ home });
  const context = await resolveBrainContext({ home, root });
  const index = await brainReconcileStatus({ home });
  const actions = [...result.actions];
  if (context.projectKey && !context.entry) actions.push(action('recommended', 'register project Brain', 'Configured project is missing from the work-project registry.'));
  if (registry.projects.some((entry) => entry.inclusion === 'included') && (index.status !== 'ok' || index.state !== 'complete')) actions.push(action('recommended', 'reconcile Brain indexes', 'Run brain reconcile --scope all to inspect the incomplete or absent index.'));
  return { ...result, status: result.status !== 'ok' || actions.some((item) => ['failed', 'recommended', 'conflict'].includes(item.state)) ? 'partial' : 'ok', registry: { projects: registry.projects.length, current: context.entry?.key || null }, reconciliation: index, actions };
}
