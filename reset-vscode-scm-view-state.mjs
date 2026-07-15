#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultUserDataDir = path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'Code', 'User');
const scmStateKeys = [
  'workbench.scm.views.state',
  'workbench.view.scm.numberOfVisibleViews',
  'scm.viewState2',
  'scm:view:visibleRepositories',
];
const scmVisibleViewCount = '3';
const scmViewsState = JSON.stringify({
  'workbench.scm': {
    collapsed: false,
    isHidden: false,
    size: 488,
  },
  'workbench.scm.repositories': {
    collapsed: false,
    isHidden: false,
  },
  'workbench.scm.history': {
    collapsed: false,
    isHidden: false,
    size: 142,
  },
});

main();

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  if (!options.projectPath && !options.storageId) {
    printUsage();
    exitWithError('Pass either --project <path> or --storage-id <id>.');
  }

  const userDataDir = resolveShellPath(options.userDataDir ?? defaultUserDataDir);
  const workspaceStorageRoot = path.join(userDataDir, 'workspaceStorage');
  assertDirectoryExists(workspaceStorageRoot, 'VS Code workspaceStorage directory');

  const storageDir = options.storageId
    ? storageDirFromId(workspaceStorageRoot, options.storageId)
    : findWorkspaceStorageDir(workspaceStorageRoot, options.projectPath);

  const stateDbPath = path.join(storageDir, 'state.vscdb');
  assertFileExists(stateDbPath, 'VS Code workspace state database');

  if (isDatabaseOpen(stateDbPath)) {
    exitWithError([
      'VS Code still has this workspace state database open.',
      'Close the project window, then run this script again.',
      stateDbPath,
    ].join('\n'));
  }

  resetScmViewState(stateDbPath, options.dryRun);
}

function parseArgs(args) {
  const options = {
    dryRun: false,
    help: false,
    projectPath: undefined,
    storageId: undefined,
    userDataDir: undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const currentArg = args[index];
    const [rawName, inlineValue] = currentArg.includes('=') ? currentArg.split(/=(.*)/s, 2) : [currentArg, undefined];

    if (rawName === '--help' || rawName === '-h') {
      options.help = true;
      continue;
    }

    if (rawName === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    const value = inlineValue ?? args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      exitWithError(`Missing value for ${rawName}.`);
    }

    if (inlineValue === undefined) {
      index += 1;
    }

    switch (rawName) {
      case '--project':
        options.projectPath = value;
        break;
      case '--storage-id':
        options.storageId = value;
        break;
      case '--user-data-dir':
        options.userDataDir = value;
        break;
      default:
        exitWithError(`Unknown option: ${rawName}.`);
    }
  }

  return options;
}

function printUsage() {
  console.log(`Reset VS Code Source Control view state for one workspace.

Usage:
  reset-vscode-scm-view-state.mjs --project <project-root> [options]
  reset-vscode-scm-view-state.mjs --storage-id <workspaceStorage-id> [options]

Options:
  --dry-run               Show the SCM state keys without changing files.
  --user-data-dir <path>  VS Code User data dir. Default: ${defaultUserDataDir}
  -h, --help              Show this help.

Example:
  ./reset-vscode-scm-view-state.mjs --project /home/branja/workspace/LAMBDA/apps/etf-compass

Close the affected VS Code window before running the real reset.`);
}

function findWorkspaceStorageDir(workspaceStorageRoot, projectPath) {
  const normalizedProjectPath = normalizeFsPath(projectPath);
  const expectedUri = pathToFileURL(normalizedProjectPath).href;

  const matches = fs.readdirSync(workspaceStorageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[0-9a-f]{32}$/iu.test(entry.name))
    .map((entry) => readWorkspaceEntry(workspaceStorageRoot, entry.name))
    .filter((entry) => entry !== undefined)
    .filter((entry) => {
      return entry.folder !== undefined && workspaceEntryMatchesPath(entry.folder, normalizedProjectPath, expectedUri);
    });

  if (matches.length === 0) {
    exitWithError(`Could not find workspace storage for ${normalizedProjectPath}.`);
  }

  if (matches.length > 1) {
    const choices = matches.map((match) => `  ${match.id} -> ${match.folder}`).join('\n');
    exitWithError([
      'Found multiple workspace storage entries for this project.',
      choices,
      'Run again with --storage-id <id> for the active one.',
    ].join('\n'));
  }

  return matches[0].path;
}

function readWorkspaceEntry(workspaceStorageRoot, storageId) {
  const workspaceJsonPath = path.join(workspaceStorageRoot, storageId, 'workspace.json');

  if (!fs.existsSync(workspaceJsonPath)) {
    return undefined;
  }

  try {
    const workspaceJson = JSON.parse(fs.readFileSync(workspaceJsonPath, 'utf8'));
    return {
      folder: typeof workspaceJson.folder === 'string' ? workspaceJson.folder : undefined,
      id: storageId,
      path: path.join(workspaceStorageRoot, storageId),
    };
  } catch {
    return undefined;
  }
}

function workspaceEntryMatchesPath(entryFolderUri, normalizedProjectPath, expectedUri) {
  if (entryFolderUri === expectedUri) {
    return true;
  }

  try {
    return normalizeFsPath(fileURLToPath(entryFolderUri)) === normalizedProjectPath;
  } catch {
    return false;
  }
}

function storageDirFromId(workspaceStorageRoot, storageId) {
  const storageDir = path.join(workspaceStorageRoot, storageId);
  assertDirectoryExists(storageDir, 'workspace storage directory');
  assertFileExists(path.join(storageDir, 'workspace.json'), 'workspace.json');
  return storageDir;
}

function isDatabaseOpen(stateDbPath) {
  const result = spawnSync('lsof', [stateDbPath], { encoding: 'utf8' });
  return result.status === 0 && result.stdout.includes(stateDbPath);
}

function resetScmViewState(stateDbPath, dryRun) {
  const currentRows = queryScmRows(stateDbPath);

  if (currentRows.trim() === '') {
    console.log('No SCM view state rows found. Nothing to reset.');
    return;
  }

  console.log('SCM view state rows:');
  console.log(currentRows);

  if (dryRun) {
    console.log('Dry run only. No files were changed.');
    return;
  }

  const backupPath = `${stateDbPath}.backup-scm-${timestamp()}`;
  fs.copyFileSync(stateDbPath, backupPath);

  const deleteSql = `DELETE FROM ItemTable WHERE key IN (${scmStateKeys.map(sqliteQuote).join(', ')});`;
  const visibleViewsSql = [
    'INSERT INTO ItemTable(key,value)',
    `VALUES ('workbench.view.scm.numberOfVisibleViews', CAST(${sqliteQuote(scmVisibleViewCount)} AS BLOB));`,
  ].join(' ');
  const viewsStateSql = [
    'INSERT INTO ItemTable(key,value)',
    `VALUES ('workbench.scm.views.state', CAST(${sqliteQuote(scmViewsState)} AS BLOB));`,
  ].join(' ');
  const result = spawnSync('sqlite3', [stateDbPath, deleteSql], { encoding: 'utf8' });

  if (result.status !== 0) {
    exitWithError(`Failed to reset SCM view state: ${result.stderr.trim()}`);
  }

  const insertResult = spawnSync('sqlite3', [stateDbPath, `${visibleViewsSql} ${viewsStateSql}`], { encoding: 'utf8' });

  if (insertResult.status !== 0) {
    exitWithError(`Failed to write SCM view defaults: ${insertResult.stderr.trim()}`);
  }

  console.log(`Backup: ${backupPath}`);
  console.log('SCM view state reset to visible defaults. Reopen the workspace to reload Source Control.');
}

function queryScmRows(stateDbPath) {
  const keys = scmStateKeys.map(sqliteQuote).join(', ');
  const sql = `SELECT key || ' = ' || CAST(value AS TEXT) FROM ItemTable WHERE key IN (${keys});`;
  const result = spawnSync('sqlite3', [stateDbPath, sql], { encoding: 'utf8' });

  if (result.status !== 0) {
    exitWithError(`Failed to read SCM view state: ${result.stderr.trim()}`);
  }

  return result.stdout;
}

function sqliteQuote(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

function resolveShellPath(inputPath) {
  if (inputPath === '~') {
    return os.homedir();
  }

  if (inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return path.resolve(inputPath);
}

function normalizeFsPath(inputPath) {
  const resolvedPath = resolveShellPath(inputPath);
  return resolvedPath.length > 1 ? resolvedPath.replace(/\/+$/u, '') : resolvedPath;
}

function assertDirectoryExists(directoryPath, label) {
  if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
    exitWithError(`${label} does not exist or is not a directory: ${directoryPath}`);
  }
}

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    exitWithError(`${label} does not exist or is not a file: ${filePath}`);
  }
}

function exitWithError(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}
