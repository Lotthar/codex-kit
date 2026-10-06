import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { isatty } from 'node:tty';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { action, atomicWrite, print } from './util.mjs';
import { applyGlobal, applyModelRoutingPlan, checkUpdates, codexHome, globalPlan, modelRoutingPlan, modelRoutingStatus, safeExport, setAllowlistedConfig } from './global.mjs';
import { applyProject, doctor, findProjectRoot, modifyProject, projectDiff, projectPlan, projectStatus, rollbackProject } from './project.mjs';
import { enrich, sanitizedInventory } from './enrichment.mjs';
import { importSkill } from './skills.mjs';
import { listTransactions } from './transaction.mjs';
import { brainAudit, brainConfigure, brainInit, brainMigrate, brainRecall, brainRead, brainStatus } from './obsidian.mjs';
import { brainProjects, brainRegister, brainRekey, loadBrainRegistry } from './brain-registry.mjs';
import { brainReconcile } from './brain-reconcile.mjs';
import { brainRepair } from './brain-repair.mjs';
import { brainAlignment, finishProjectSetup, prepareProject, registerProject, rememberAndIndex, resolveBrainContext, setupProject } from './brain-workflow.mjs';
import { upgradeAll } from './brain-upgrade.mjs';

const help = `Codex Kit — reproducible Codex setup

Usage:
  codex-kit wizard
  codex-kit setup [--preset NAME] [--model-routing] [--obsidian] [--memories] [--yes] [--allow-network]
  codex-kit models status|refresh [--home PATH] [--yes]
  codex-kit brain configure --vault NAME [--home PATH] [--yes]
  codex-kit brain register [--root PATH | --external-id ID] [--project KEY] [--name NAME] [--topics CSV] [--inclusion included|excluded|pending] [--yes]
  codex-kit brain projects [--home PATH]
  codex-kit brain init|status|audit [--root PATH] [--project KEY]
  codex-kit brain reconcile [--scope project|all] [--project KEY] [--yes]
  codex-kit brain read --path NOTE_PATH [--project KEY]
  codex-kit brain repair --scope global|project [--root PATH] [--expected-hash HASH] [--yes]
  codex-kit brain migrate --to PROJECT_KEY [--root PATH] [--yes]
  codex-kit brain recall --query TEXT [--scope project|related|all] [--cross-project] [--project KEY] [--root PATH]
  codex-kit brain remember --kind decision|lesson|runbook|question|overview --title TEXT --summary TEXT [--details TEXT] [--source REF] [--supersedes KEY] [--yes]
  codex-kit context status [--root PATH] [--home PATH] [--json]
  codex-kit project init|plan|apply|refresh|status [--root PATH]
  codex-kit component add|remove|list ID [--root PATH]
  codex-kit skill import NAME --source PATH [--yes]
  codex-kit diff [--root PATH]
  codex-kit doctor [--all]
  codex-kit upgrade --all [--expected-hash HASH] [--resume ID] [--yes]
  codex-kit history [--root PATH]
  codex-kit rollback [--transaction ID] [--root PATH]
  codex-kit update --check [--allow-network]
  codex-kit export [--source PATH] [--output PATH] [--include-content] [--yes]
  codex-kit config set features.key --value true [--yes]

Mutations preview by default. --yes applies; --dry-run always previews; --json never prompts.`;

const optionSpec = {
  all: { type: 'boolean' }, scope: { type: 'string' }, project: { type: 'string' }, name: { type: 'string' }, topics: { type: 'string' }, inclusion: { type: 'string' }, 'external-id': { type: 'string' }, path: { type: 'string' }, 'expected-hash': { type: 'string' }, resume: { type: 'string' },
  yes: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean' }, check: { type: 'boolean' }, 'include-content': { type: 'boolean' }, 'allow-network': { type: 'boolean' }, 'model-routing': { type: 'boolean' }, memories: { type: 'boolean' }, obsidian: { type: 'boolean' }, 'cross-project': { type: 'boolean' }, enrich: { type: 'boolean' }, global: { type: 'boolean' }, preset: { type: 'string' }, home: { type: 'string' }, root: { type: 'string' }, source: { type: 'string' }, output: { type: 'string' }, transaction: { type: 'string' }, value: { type: 'string' }, vault: { type: 'string' }, query: { type: 'string' }, kind: { type: 'string' }, title: { type: 'string' }, summary: { type: 'string' }, details: { type: 'string' }, supersedes: { type: 'string' }, to: { type: 'string' }
};

const execute = (values) => Boolean(values.yes) && !values['dry-run'];
const resultCode = (result) => ['conflict', 'failed'].includes(result.status) ? 1 : 0;

export function foundationRecommendations(graphifyRecommended = false) {
  return [
    { id: 'ponytail', scope: 'global', detail: 'everyday simplicity and the smallest correct implementation' },
    { id: 'ruflo', scope: 'global', detail: 'durable coordination for three or more dependent workstreams' },
    { id: 'model-routing', scope: 'global', detail: 'optional capability-aware parent and subagent model roles' },
    { id: 'graphify', scope: 'project', detail: graphifyRecommended ? 'structural repository context; strongly recommended for this project' : 'structural repository context as the codebase grows' },
    { id: 'obsidian-brain', scope: 'global + project', detail: 'optional durable curated project memory; included by the personal preset' }
  ];
}

function parse(argv) { return parseArgs({ args: argv, options: optionSpec, allowPositionals: true, strict: true }); }

async function runWizard(values) {
  if (!isatty(stdin.fd) || values.json) throw new Error('Wizard requires an interactive terminal. Use explicit commands with --yes in automation.');
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    stdout.write('Recommended foundation: Ponytail for everyday simplicity; Ruflo for durable complex coordination; Graphify for repository structure.\n');
    stdout.write('Ponytail and Ruflo are global integrations. Graphify and bundled skills are project-local.\n\n');
    const scope = (await rl.question('Scope (project/global/both) [both]: ')).trim() || 'both';
    const preset = (await rl.question('Preset (minimal/developer/personal) [developer]: ')).trim() || 'developer';
    if (!['project', 'global', 'both'].includes(scope)) throw new Error('Scope must be project, global, or both.');
    const allowNetwork = scope === 'project' ? false : (await rl.question('Install the recommended global Ponytail plugin and Ruflo MCP (network access)? (y/N): ')).trim().toLowerCase() === 'y';
    const modelRouting = scope === 'project' ? false : (await rl.question('Configure optional dynamic Codex model-routing roles? (y/N): ')).trim().toLowerCase() === 'y';
    const useBrain = preset === 'personal' || (await rl.question('Enable the optional Obsidian Project Brain? (y/N): ')).trim().toLowerCase() === 'y';
    const vault = useBrain ? (await rl.question('Dedicated Obsidian vault name [Codex Brain]: ')).trim() || 'Codex Brain' : '';
    const memories = scope === 'project' ? false : (await rl.question('Enable experimental native Codex memories as a separate companion? (y/N): ')).trim().toLowerCase() === 'y';
    const plans = [];
    const recommendations = foundationRecommendations();
    if (scope !== 'global') {
      let plan = await prepareProject({ home: values.home || codexHome(), root: values.root || process.cwd(), preset });
      recommendations.splice(0, recommendations.length, ...foundationRecommendations(plan.graphifyRecommended));
      stdout.write(`Detected profiles: ${plan.profiles.join(', ')}.\n`);
      const tools = (await rl.question('Project foundation (graphify,workflow-skills,promptx,clean-code) [all for preset]: ')).trim();
      if (tools) {
        const include = tools.toLowerCase() === 'none' ? [] : tools.split(',').map((item) => item.trim()).filter(Boolean);
        plan.config.preset = 'minimal';
        plan.config.components.include = include;
        plan = await projectPlan({ root: plan.root, requestedConfig: plan.config });
      }
      if (plan.components.includes('graphify') && (await rl.question('Provision the recommended Graphify setup adapter? (Y/n): ')).trim().toLowerCase() !== 'n') {
        plan.config.tools.graphify.install = true;
        plan = await projectPlan({ root: plan.root, requestedConfig: plan.config });
      }
      if (useBrain && !plan.components.includes('obsidian-brain')) {
        plan.config.components.include = [...new Set([...(plan.config.components.include ?? []), 'obsidian-brain'])];
        plan = await projectPlan({ root: plan.root, requestedConfig: plan.config });
      }
      plans.push(plan);
    }
    if (scope !== 'project') plans.push(await globalPlan({ preset, home: values.home || codexHome(), allowNetwork, modelRouting, memories, obsidian: useBrain }));
    const recommendationActions = recommendations.map((item) => action('recommended', `${item.id} (${item.scope})`, item.detail));
    if (scope === 'project') recommendationActions.push(action('recommended', 'configure global foundation later', 'run codex-kit setup --preset developer --allow-network --yes when ready'));
    const brainActions = useBrain ? [action('planned', 'bind Obsidian Project Brain vault', vault), ...(plans.some((plan) => plan.root && plan.components.includes('obsidian-brain')) ? [action('planned', 'initialize project brain namespace', 'after project setup')] : [])] : [];
    print({ status: 'ok', actions: [...recommendationActions, ...plans.flatMap((plan) => plan.actions), ...brainActions] }, false);
    if ((await rl.question('Apply this plan? (y/N): ')).trim().toLowerCase() !== 'y') return { status: 'ok', actions: [action('skipped', 'apply wizard plan', 'not confirmed')] };
    const results = [];
    if (useBrain) results.push(await brainConfigure({ home: values.home || codexHome(), vault, execute: true }));
    for (const plan of plans) {
      const applied = plan.root ? await finishProjectSetup({ home: values.home || codexHome(), result: await applyProject(plan), execute: true }) : await applyGlobal(plan, allowNetwork);
      results.push(applied);
    }
    return { status: results.some((item) => item.status !== 'ok') ? 'partial' : 'ok', actions: results.flatMap((item) => item.actions) };
  } finally { rl.close(); }
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const { values, positionals } = parse(argv);
    const [command, subcommand, value] = positionals;
    const json = values.json;
    if (!command || values.help || command === 'help') { process.stdout.write(`${help}\n`); return 0; }
    const shouldApply = execute(values);
    let result;
    if (command === 'wizard') result = await runWizard(values);
    else if (command === 'setup' || command === 'apply') {
      const plan = await globalPlan({ preset: values.preset || 'developer', home: values.home || codexHome(), allowNetwork: values['allow-network'], modelRouting: values['model-routing'], memories: values.memories, obsidian: values.obsidian });
      result = shouldApply ? await applyGlobal(plan, values['allow-network']) : plan;
    } else if (command === 'models' && ['status', 'plan', 'refresh', 'apply'].includes(subcommand)) {
      if (subcommand === 'status') result = await modelRoutingStatus({ home: values.home || codexHome() });
      else {
        const plan = await modelRoutingPlan({ home: values.home || codexHome() });
        result = ['refresh', 'apply'].includes(subcommand) && shouldApply ? await applyModelRoutingPlan(plan) : plan;
      }
    } else if (command === 'brain' && subcommand === 'configure') {
      if (!values.vault) throw new Error('Use: codex-kit brain configure --vault NAME --yes');
      result = await brainConfigure({ home: values.home || codexHome(), vault: values.vault, execute: shouldApply });
    } else if (command === 'brain' && subcommand === 'projects') result = await brainProjects({ home: values.home || codexHome() });
    else if (command === 'brain' && subcommand === 'register') result = await registerProject({ home: values.home || codexHome(), root: values.root, project: values.project, name: values.name, externalId: values['external-id'], topics: values.topics?.split(',').map((item) => item.trim()).filter(Boolean), inclusion: values.inclusion, execute: shouldApply });
    else if (command === 'brain' && subcommand === 'repair') result = await brainRepair({ home: values.home || codexHome(), root: values.root || process.cwd(), scope: values.scope || 'project', execute: shouldApply, expectedHash: values['expected-hash'] });
    else if (command === 'brain' && subcommand === 'reconcile') {
      const home = values.home || codexHome();
      const context = await resolveBrainContext({ home, root: values.root || process.cwd(), project: values.project });
      const scope = values.scope || (values.project ? 'project' : 'all');
      if (scope === 'project' && !context.projectKey) throw new Error('Project reconciliation requires a registered project.');
      result = await brainReconcile({ home, projects: context.registry.projects, projectKey: context.projectKey, scope, execute: shouldApply });
    } else if (command === 'brain' && ['init', 'status', 'recall', 'read', 'remember', 'audit', 'migrate'].includes(subcommand)) {
      const home = values.home || codexHome();
      const context = await resolveBrainContext({ home, root: values.root || process.cwd(), project: values.project });
      const { root, projectKey, local: project, registry } = context;
      if (subcommand !== 'status' && !projectKey) result = { status: 'partial', actions: [action('recommended', 'initialize project Obsidian configuration', 'codex-kit project init --preset personal --yes')] };
      else if (subcommand === 'init') {
        if (context.entry && context.entry.inclusion !== 'included') result = { status: 'partial', initialized: false, actions: [action('skipped', 'initialize Brain project', `Project is ${context.entry.inclusion}.`)] };
        else {
          if (shouldApply && !context.entry) await brainRegister({ home, key: projectKey, name: root.split(/[\\/]/).pop(), root, kind: 'git', execute: true });
          result = await brainInit({ home, projectKey, execute: shouldApply });
          if (!shouldApply) result.actions.push(...(!context.entry ? [action('planned', 'register brain project', projectKey)] : []), action('planned', 'reconcile generated Brain indexes', 'CodexKit/Brain for included work projects'));
          if (shouldApply && result.initialized) {
            const index = await brainReconcile({ home, projects: (await loadBrainRegistry({ home })).projects, scope: 'all', execute: true });
            result = { ...result, status: index.status, indexed: index.status === 'ok', actions: [...result.actions, ...index.actions] };
          }
        }
      }
      else if (subcommand === 'status') result = await brainStatus({ home: values.home || codexHome(), projectKey });
      else if (subcommand === 'migrate') {
        if (!project?.config) throw new Error('Namespace migration requires a configured Git project.');
        if (!values.to) throw new Error('Use: codex-kit brain migrate --to PROJECT_KEY [--yes]');
        const rekeyPreview = await brainRekey({ home, fromKey: projectKey, toKey: values.to });
        if (rekeyPreview.status !== 'ok') { print(rekeyPreview, json); return 1; }
        const preview = await brainMigrate({ home: values.home || codexHome(), fromProjectKey: projectKey, toProjectKey: values.to });
        if (!shouldApply || preview.status !== 'ok') result = preview;
        else {
          const configPath = join(root, '.codex-kit', 'config.json');
          const originalConfig = `${JSON.stringify(project.config, null, 2)}\n`;
          const updatedConfig = structuredClone(project.config);
          updatedConfig.tools ??= {};
          updatedConfig.tools.obsidian ??= {};
          updatedConfig.tools.obsidian.projectKey = values.to;
          await atomicWrite(configPath, `${JSON.stringify(updatedConfig, null, 2)}\n`);
          try {
            result = await brainMigrate({ home: values.home || codexHome(), fromProjectKey: projectKey, toProjectKey: values.to, execute: true });
            if (result.status === 'ok') {
              try {
                const rekey = await brainRekey({ home, fromKey: projectKey, toKey: values.to, execute: true });
                if (rekey.status !== 'ok') result = { ...result, status: 'partial', actions: [...result.actions, ...rekey.actions] };
                else {
                  const index = await brainReconcile({ home, projects: (await loadBrainRegistry({ home })).projects, scope: 'all', execute: true });
                  result = { ...result, status: index.status, indexed: index.status === 'ok', actions: [...result.actions, ...index.actions] };
                }
              }
              catch (error) { result = { ...result, status: 'partial', actions: [...result.actions, action('failed', 'update migrated project registry', error.message)] }; }
            }
            if (result.status !== 'ok' && !result.migrated) {
              await atomicWrite(configPath, originalConfig);
              result = { ...result, actions: [...result.actions, action('changed', 'restore local Obsidian project key', 'source project key restored')] };
            }
          } catch (error) {
            await atomicWrite(configPath, originalConfig);
            throw error;
          }
        }
      }
      else if (subcommand === 'recall') result = await brainRecall({ home, root, projectKey, query: values.query, crossProject: values['cross-project'], scope: values.scope || (values['cross-project'] ? 'all' : context.entry?.inclusion === 'included' ? registry.defaultScope : 'project'), projects: registry.projects });
      else if (subcommand === 'read') result = await brainRead({ home, projectKey, path: values.path });
      else if (subcommand === 'remember') result = await rememberAndIndex({ home, root, projectKey, kind: values.kind, title: values.title, summary: values.summary, details: values.details, source: values.source, supersedes: values.supersedes, topics: values.topics?.split(',').map((item) => item.trim()).filter(Boolean), execute: shouldApply });
      else result = await brainAudit({ home: values.home || codexHome(), root, projectKey, crossProject: values['cross-project'] });
    } else if (command === 'context' && subcommand === 'status') result = await brainAlignment({ root: values.root || process.cwd(), home: values.home || codexHome() });
    else if (command === 'project' && ['init', 'plan', 'apply', 'refresh'].includes(subcommand)) {
      const root = values.root || process.cwd();
      const shouldExecute = ['init', 'refresh', 'apply'].includes(subcommand) && shouldApply;
      result = await setupProject({ home: values.home || codexHome(), root, preset: values.preset || 'developer', execute: shouldExecute });
      if (values.enrich) result.enrichment = await enrich(sanitizedInventory({ profiles: result.profiles, components: result.components, graphifyRecommended: result.graphifyRecommended, sourceCount: result.inventory?.sourceCount }));
    } else if (command === 'project' && subcommand === 'status') result = await projectStatus(values.root || process.cwd());
    else if (command === 'component' && ['add', 'remove'].includes(subcommand)) {
      if (!value) throw new Error(`Component ID is required: codex-kit component ${subcommand} ID`);
      result = await modifyProject({ root: values.root || process.cwd(), component: value, remove: subcommand === 'remove', execute: shouldApply });
    } else if (command === 'component' && subcommand === 'list') {
      const plan = await projectPlan({ root: values.root || process.cwd(), preset: values.preset || 'developer' });
      result = { status: 'ok', components: plan.components, actions: plan.components.map((id) => action('unchanged', 'selected component', id)) };
    } else if (command === 'add' || command === 'remove') {
      if (!subcommand) throw new Error(`Component ID is required: codex-kit ${command} ID`);
      result = await modifyProject({ root: values.root || process.cwd(), component: subcommand, remove: command === 'remove', execute: shouldApply });
    } else if (command === 'skill' && subcommand === 'import') {
      if (!value || !values.source) throw new Error('Use: codex-kit skill import NAME --source PATH');
      result = await importSkill({ root: values.root || process.cwd(), sourceRoot: values.source, name: value, execute: shouldApply });
    } else if (command === 'diff') result = await projectDiff(await projectPlan({ root: values.root || process.cwd(), preset: values.preset || 'developer' }));
    else if (command === 'upgrade') {
      if (!values.all) throw new Error('Use upgrade --all to preview registered work-project upgrades.');
      result = await upgradeAll({ home: values.home || codexHome(), execute: shouldApply, resume: values.resume, expectedHash: values['expected-hash'] });
    } else if (command === 'doctor') {
      const home = values.home || codexHome();
      const prerequisites = doctor();
      const registry = await loadBrainRegistry({ home });
      const roots = values.all ? [...new Set(registry.projects.filter((entry) => entry.inclusion === 'included' && entry.root).map((entry) => entry.root))] : [values.root || process.cwd()];
      const alignment = [];
      for (const root of roots) {
        try { alignment.push(await brainAlignment({ home, root })); }
        catch (error) { alignment.push({ root, status: 'partial', actions: [action('failed', 'inspect alignment', error.message)] }); }
      }
      const index = values.all && registry.projects.length ? await brainReconcile({ home, projects: registry.projects, scope: 'all' }) : null;
      result = { ...prerequisites, status: prerequisites.status !== 'ok' || alignment.some((item) => item.status !== 'ok') || (index && (index.status !== 'ok' || index.actions.some((item) => item.state === 'planned'))) ? 'partial' : 'ok', alignment, ...(index ? { index } : {}), actions: [...prerequisites.actions, ...alignment.flatMap((item) => item.actions), ...(index?.actions || [])] };
    }
    else if (command === 'history') {
      const root = await findProjectRoot(values.root || process.cwd());
      result = { status: 'ok', transactions: await listTransactions(root), actions: [action('unchanged', 'list transactions')] };
    } else if (command === 'rollback') {
      if (!shouldApply) result = { status: 'ok', actions: [action('planned', 'rollback transaction', values.transaction || 'latest')] };
      else result = await rollbackProject(values.root || process.cwd(), values.transaction);
    } else if (command === 'export') {
      if (values.output && !shouldApply) throw new Error('Writing an export requires --yes; omit --output to preview.');
      result = await safeExport(values.source || codexHome(), values.output, values['include-content']);
      if (values.output && shouldApply) await atomicWrite(values.output, `${JSON.stringify(result, null, 2)}\n`);
      result.actions = [action(values.output ? 'changed' : 'planned', 'export safe portable inventory', values.output || 'stdout')];
    } else if (command === 'config' && subcommand === 'set') {
      const [section, key] = String(value ?? '').split('.', 2);
      if (!section || !key || values.value === undefined) throw new Error('Use: codex-kit config set features.key --value true --yes');
      result = shouldApply ? await setAllowlistedConfig({ home: values.home || codexHome(), section, key, value: values.value }) : { status: 'ok', actions: [action('planned', 'set allowlisted Codex config', `${section}.${key}`)] };
    } else if (command === 'update' && (!subcommand || subcommand === '--check')) result = await checkUpdates(values['allow-network']);
    else throw new Error(`Unknown command: ${command}`);
    if (['component', 'add', 'remove'].includes(command) && result.root) result = await finishProjectSetup({ home: values.home || codexHome(), result, execute: shouldApply });
    print(result, json);
    return resultCode(result);
  } catch (error) {
    const result = { status: 'failed', error: error.message, actions: [action('failed', 'Codex Kit', error.message)] };
    print(result, argv.includes('--json'));
    return 1;
  }
}
