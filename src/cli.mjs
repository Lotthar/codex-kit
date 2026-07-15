import { join, resolve } from 'node:path';
import { loadLock } from './manifest.mjs';
import { applyGlobal, globalPlan, safeExport, codexHome, setAllowlistedConfig } from './global.mjs';
import { doctor, findProjectRoot, initProject, modifyProject, rollbackProject } from './project.mjs';
import { enrich } from './enrichment.mjs';
import { importSkill } from './skills.mjs';
import { parseArgs, print } from './util.mjs';

const help = `Codex Kit — reproducible Codex setup\n\nUsage:\n  codex-kit setup [--preset minimal|developer|personal] [--yes] [--allow-network]\n  codex-kit project init|refresh [--yes] [--preset NAME] [--enrich]\n  codex-kit add|remove COMPONENT [--yes]\n  codex-kit skill import NAME --source PATH [--yes]\n  codex-kit diff\n  codex-kit doctor\n  codex-kit update\n  codex-kit rollback [--yes]\n  codex-kit export [--source PATH] [--output PATH]\n\nMutations preview by default. --yes applies; --dry-run always previews.`;

function shouldExecute(options) { return Boolean(options.yes) && !options['dry-run']; }
function needConfirmation(options, command) { if (!shouldExecute(options)) return false; return true; }

export async function main(argv = process.argv.slice(2)) {
  const { positional, options } = parseArgs(argv);
  const json = Boolean(options.json);
  const [command, subcommand, value] = positional;
  if (!command || options.help || command === 'help') { process.stdout.write(`${help}\n`); return 0; }
  try {
    let result;
    if (command === 'setup' || command === 'apply') {
      const args = { preset: options.preset || 'developer', home: options.home || codexHome(), allowNetwork: Boolean(options['allow-network']), execute: shouldExecute(options) };
      result = args.execute ? await applyGlobal(args) : await globalPlan(args);
    } else if (command === 'project' && (subcommand === 'init' || subcommand === 'refresh')) {
      const root = await findProjectRoot(options.root || process.cwd());
      result = await initProject({ root, preset: options.preset || 'developer', execute: shouldExecute(options), enrich: Boolean(options.enrich) });
      if (options.enrich && shouldExecute(options)) result.enrichment = await enrich({ root: result.root, profiles: result.profiles, components: result.components, graphifyRecommended: result.graphifyRecommended });
    } else if (command === 'add' || command === 'remove') {
      if (!subcommand) throw new Error(`Component is required: codex-kit ${command} COMPONENT`);
      result = await modifyProject({ root: options.root || process.cwd(), component: subcommand, remove: command === 'remove', execute: shouldExecute(options) });
    } else if (command === 'skill' && subcommand === 'import') {
      if (!value) throw new Error('Skill name is required: codex-kit skill import NAME --source PATH');
      if (!options.source) throw new Error('--source must point to the portable skills directory.');
      result = await importSkill({ root: options.root || process.cwd(), sourceRoot: options.source, name: value, execute: shouldExecute(options) });
    } else if (command === 'diff') {
      result = await initProject({ root: options.root || process.cwd(), preset: options.preset || 'developer', execute: false });
    } else if (command === 'doctor') {
      result = doctor();
    } else if (command === 'update') {
      result = { lock: await loadLock(), actions: [{ state: options['allow-network'] ? 'planned' : 'skipped', label: 'check component updates', detail: options['allow-network'] ? 'network update checks are intentionally manual in v1' : 'pass --allow-network to acknowledge a network check' }] };
    } else if (command === 'rollback') {
      if (!shouldExecute(options)) result = { actions: [{ state: 'planned', label: 'restore latest project backup', detail: 'pass --yes to apply' }] };
      else result = await rollbackProject(await findProjectRoot(options.root || process.cwd()));
    } else if (command === 'export') {
      result = await safeExport(options.source || codexHome(), options.output);
      result.actions = [{ state: options.output ? 'applied' : 'planned', label: 'export safe portable inventory', detail: options.output || 'stdout' }];
    } else if (command === 'config' && subcommand === 'set') {
      if (!shouldExecute(options)) result = { actions: [{ state: 'planned', label: 'set allowlisted Codex config', detail: 'pass --yes to apply' }] };
      else {
        const [section, assignment] = String(value || '').split('.', 2);
        const [key, raw] = String(options.value || '').split('=', 2);
        if (!section || !assignment || !key || raw === undefined) throw new Error('Use: config set features.key --value key=true');
        result = await setAllowlistedConfig(join(options.home || codexHome(), 'config.toml'), section, { [assignment]: raw }, options.home || codexHome());
        result.actions = [{ state: 'applied', label: 'set allowlisted Codex config', detail: `${section}.${assignment}` }];
      }
    } else throw new Error(`Unknown command: ${command}`);
    print(result, json);
    return 0;
  } catch (error) {
    const output = { error: error.message, actions: [{ state: 'conflict', label: 'Codex Kit', detail: error.message }] };
    print(output, json);
    return 1;
  }
}
