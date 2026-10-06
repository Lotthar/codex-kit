import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { kitRoot, loadManifest } from './manifest.mjs';
import { action, exists, readJson } from './util.mjs';
import { beginTransaction, copyTracked, finishTransaction, pathHash, replaceTracked, rollbackTransaction, withLock, writeTracked } from './transaction.mjs';

function statePath(base, scope) {
  return join(base, '.codex-kit', scope === 'global' ? 'global-assets.json' : 'state.json');
}

async function brainAsset(scope) {
  const manifest = await loadManifest();
  const component = manifest.components['obsidian-brain'];
  const assets = scope === 'global' ? component.globalAssets : component.assets;
  if (!Array.isArray(assets) || assets.length !== 1) throw new Error('Obsidian Brain must declare exactly one repairable skill asset.');
  return { component: 'obsidian-brain', ...assets[0] };
}

async function isSymlink(path) {
  try { return (await lstat(path)).isSymbolicLink(); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function repairPlan({ home, root, scope }) {
  if (!['global', 'project'].includes(scope)) throw new Error('Brain repair scope must be global or project.');
  const base = scope === 'global' ? home : root;
  if (!base) throw new Error(`Brain repair ${scope} scope requires its base path.`);
  const asset = await brainAsset(scope);
  const source = join(kitRoot, asset.source);
  const target = join(base, asset.target);
  const sourceHash = await pathHash(source);
  const targetExists = exists(target);
  const unsafe = targetExists && await isSymlink(target);
  const installedHash = targetExists && !unsafe ? await pathHash(target) : null;
  const state = await readJson(statePath(base, scope), { assets: [] });
  const owned = Array.isArray(state.assets) ? state.assets.find((item) => item?.target === asset.target) : null;
  const matching = installedHash === sourceHash;
  const ownership = !targetExists ? 'missing' : unsafe ? 'unsafe' : owned ? owned.hash === installedHash ? (matching ? 'owned-current' : 'owned-outdated') : 'owned-modified' : matching ? 'unmanaged-current' : 'unmanaged-divergent';
  return { status: unsafe ? 'partial' : 'ok', home, root, scope, asset, sourceHash, installedHash, ownership, target, actions: [action(unsafe ? 'warning' : ownership === 'owned-current' ? 'unchanged' : 'planned', `repair ${asset.target}`, unsafe ? 'symlink target preserved' : ownership)] };
}

export async function brainRepair({ home, root, scope = 'global', execute = false, expectedHash } = {}) {
  const plan = await repairPlan({ home, root, scope });
  if (!execute || plan.ownership === 'owned-current') return plan;
  if (plan.ownership === 'unsafe') return plan;
  if (['owned-modified', 'unmanaged-divergent'].includes(plan.ownership) && expectedHash !== plan.installedHash) {
    return { ...plan, status: 'partial', actions: [action('conflict', `repair ${plan.asset.target}`, 'pass the preview installedHash as expectedHash to replace divergent content')] };
  }
  const base = scope === 'global' ? home : root;
  return withLock(base, async () => {
    const current = await repairPlan({ home, root, scope });
    if (current.ownership === 'unsafe') return current;
    if (['owned-modified', 'unmanaged-divergent'].includes(current.ownership) && expectedHash !== current.installedHash) throw new Error('Brain skill changed since preview; run a new repair preview.');
    const transaction = await beginTransaction(base, `${scope}-brain-repair`);
    try {
      if (current.ownership === 'missing') await copyTracked(transaction, join(kitRoot, current.asset.source), current.target);
      else if (current.installedHash !== current.sourceHash) await replaceTracked(transaction, join(kitRoot, current.asset.source), current.target);
      const path = statePath(base, scope);
      const state = await readJson(path, { schemaVersion: scope === 'global' ? 1 : 2, assets: [] });
      const assets = (Array.isArray(state.assets) ? state.assets : []).filter((item) => item?.target !== current.asset.target);
      assets.push({ component: 'obsidian-brain', source: current.asset.source, target: current.asset.target, hash: current.sourceHash });
      await writeTracked(transaction, path, `${JSON.stringify({ ...state, assets }, null, 2)}\n`);
      const receipt = await finishTransaction(transaction);
      return { ...await repairPlan({ home, root, scope }), status: 'ok', transactionId: receipt.id, actions: [action('changed', `repair ${current.asset.target}`, current.ownership === 'unmanaged-current' ? 'adopted matching asset' : 'installed current Brain skill')] };
    } catch (error) {
      const receipt = await finishTransaction(transaction, 'failed');
      await rollbackTransaction(base, receipt.id);
      throw error;
    }
  });
}
