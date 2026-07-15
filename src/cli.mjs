import { parseArgs } from 'node:util';
import { isatty } from 'node:tty';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { action, atomicWrite, print } from './util.mjs';
import { applyGlobal, checkUpdates, codexHome, globalPlan, safeExport, setAllowlistedConfig } from './global.mjs';
import { applyProject, doctor, findProjectRoot, initProject, modifyProject, projectDiff, projectPlan, projectStatus, rollbackProject } from './project.mjs';
import { enrich, sanitizedInventory } from './enrichment.mjs';
import { importSkill } from './skills.mjs';
import { listTransactions } from './transaction.mjs';

const help = `Codex Kit — reproducible Codex setup

Usage:
  codex-kit wizard
  codex-kit setup [--preset NAME] [--yes] [--allow-network]
  codex-kit project init|plan|apply|refresh|status [--root PATH]
  codex-kit component add|remove|list ID [--root PATH]
  codex-kit skill import NAME --source PATH [--yes]
  codex-kit diff [--root PATH]
  codex-kit doctor
  codex-kit history [--root PATH]
  codex-kit rollback [--transaction ID] [--root PATH]
  codex-kit update --check [--allow-network]
  codex-kit export [--source PATH] [--output PATH] [--include-content] [--yes]
  codex-kit config set features.key --value true [--yes]

Mutations preview by default. --yes applies; --dry-run always previews; --json never prompts.`;

const optionSpec = {
  yes: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean' }, check: { type: 'boolean' }, 'include-content': { type: 'boolean' }, 'allow-network': { type: 'boolean' }, enrich: { type: 'boolean' }, global: { type: 'boolean' }, preset: { type: 'string' }, home: { type: 'string' }, root: { type: 'string' }, source: { type: 'string' }, output: { type: 'string' }, transaction: { type: 'string' }, value: { type: 'string' }
};

const execute = (values) => Boolean(values.yes) && !values['dry-run'];
const resultCode = (result) => ['conflict', 'failed'].includes(result.status) ? 1 : 0;

export function foundationRecommendations(graphifyRecommended = false) {
  return [
    { id: 'ponytail', scope: 'global', detail: 'everyday simplicity and the smallest correct implementation' },
    { id: 'ruflo', scope: 'global', detail: 'durable coordination for three or more dependent workstreams' },
    { id: 'graphify', scope: 'project', detail: graphifyRecommended ? 'structural repository context; strongly recommended for this project' : 'structural repository context as the codebase grows' }
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
    const plans = [];
    const recommendations = foundationRecommendations();
    if (scope !== 'global') {
      let plan = await projectPlan({ root: values.root || process.cwd(), preset });
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
      plans.push(plan);
    }
    if (scope !== 'project') plans.push(await globalPlan({ preset, home: values.home || codexHome(), allowNetwork }));
    const recommendationActions = recommendations.map((item) => action('recommended', `${item.id} (${item.scope})`, item.detail));
    if (scope === 'project') recommendationActions.push(action('recommended', 'configure global foundation later', 'run codex-kit setup --preset developer --allow-network --yes when ready'));
    print({ status: 'ok', actions: [...recommendationActions, ...plans.flatMap((plan) => plan.actions)] }, false);
    if ((await rl.question('Apply this plan? (y/N): ')).trim().toLowerCase() !== 'y') return { status: 'ok', actions: [action('skipped', 'apply wizard plan', 'not confirmed')] };
    const results = [];
    for (const plan of plans) results.push(plan.root ? await applyProject(plan) : await applyGlobal(plan, allowNetwork));
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
      const plan = await globalPlan({ preset: values.preset || 'developer', home: values.home || codexHome(), allowNetwork: values['allow-network'] });
      result = shouldApply ? await applyGlobal(plan, values['allow-network']) : plan;
    } else if (command === 'project' && ['init', 'plan', 'apply', 'refresh'].includes(subcommand)) {
      const root = values.root || process.cwd();
      const shouldExecute = ['init', 'refresh', 'apply'].includes(subcommand) && shouldApply;
      result = await initProject({ root, preset: values.preset || 'developer', execute: shouldExecute, enrich: values.enrich });
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
    else if (command === 'doctor') result = doctor();
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
    print(result, json);
    return resultCode(result);
  } catch (error) {
    const result = { status: 'failed', error: error.message, actions: [action('failed', 'Codex Kit', error.message)] };
    print(result, argv.includes('--json'));
    return 1;
  }
}
