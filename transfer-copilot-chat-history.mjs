#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultUserDataDir = path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'Code', 'User');
const workspaceJsonFile = 'workspace.json';
const workspaceStateDbFiles = new Set(['state.vscdb']);
const chatStorageEntryNames = new Set([
  'AndrePimenta.claude-code-chat',
  'GitHub.copilot-chat',
  'chatEditingSessions',
  'chatSessions',
]);
const chatStateKeyNames = [
  'GitHub.copilot-chat',
  'chat.ChatSessionStore.index',
  'chat.customModes',
  'chat.customModes.local',
  'chat.disabledClaudeHooks.notification',
  'chat.terminalSessions',
  'chat.untitledInputState',
  'chat.view.hasSetDefaultModeByExperiment',
  'chat/autoconfirm',
  'github.copilot-github',
  'memento/chat-todo-list',
  'memento/interactive-session',
  'memento/interactive-session-view-copilot',
  'memento/webviewView.chatgpt.sidebarSecondaryView',
  'terminalChat.toolSessionMappings',
  'workbench.panel.chat',
  'workbench.panel.chat.numberOfVisibleViews',
  'workbench.view.extension.claude-code-chat.state',
];

main();

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  const userDataDir = resolveShellPath(options.userDataDir ?? defaultUserDataDir);
  const workspaceStorageRoot = path.join(userDataDir, 'workspaceStorage');

  if (options.list) {
    listWorkspaceStorage(workspaceStorageRoot);
    return;
  }

  if (!options.oldPath || !options.newPath) {
    printUsage();
    exitWithError('Missing required --old and --new paths.');
  }

  assertDirectoryExists(workspaceStorageRoot, 'VS Code workspaceStorage directory');

  const oldStorageDir = options.oldStorageId
    ? storageDirFromId(workspaceStorageRoot, options.oldStorageId, '--old-storage-id')
    : findWorkspaceStorageDir(workspaceStorageRoot, options.oldPath, 'old project');

  if (options.copyProject) {
    copyProjectDirectory(options.oldPath, options.newPath, options.dryRun);
  }

  const newStorageDir = options.newStorageId
    ? storageDirFromId(workspaceStorageRoot, options.newStorageId, '--new-storage-id')
    : findWorkspaceStorageDir(workspaceStorageRoot, options.newPath, 'new project', {
        allowMissing: options.copyProject,
      });

  if (newStorageDir === undefined) {
    console.log('\nProject directory step is done, but VS Code has not created storage for the new path yet.');
    console.log('Open the new project location in VS Code once, close VS Code, then run this script again.');
    return;
  }

  if (oldStorageDir === newStorageDir) {
    exitWithError([
      'The old and new project paths resolve to the same workspace storage directory.',
      'Nothing to transfer.',
    ].join(' '));
  }

  transferWorkspaceStorage({
    sourceDir: oldStorageDir,
    destinationDir: newStorageDir,
    sourceProjectPath: options.oldPath,
    destinationProjectPath: options.newPath,
    dryRun: options.dryRun,
    rewritePaths: options.rewritePaths,
  });
}

function parseArgs(args) {
  const options = {
    copyProject: false,
    dryRun: false,
    help: false,
    list: false,
    newPath: undefined,
    newStorageId: undefined,
    oldPath: undefined,
    oldStorageId: undefined,
    rewritePaths: true,
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

    if (rawName === '--copy-project') {
      options.copyProject = true;
      continue;
    }

    if (rawName === '--no-rewrite-paths') {
      options.rewritePaths = false;
      continue;
    }

    if (rawName === '--list') {
      options.list = true;
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
      case '--old':
        options.oldPath = value;
        break;
      case '--new':
        options.newPath = value;
        break;
      case '--old-storage-id':
        options.oldStorageId = value;
        break;
      case '--new-storage-id':
        options.newStorageId = value;
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
  console.log(`Transfer Copilot Chat history between moved VS Code project roots.

Usage:
  transfer-copilot-chat-history.mjs --old <old-project-root> --new <new-project-root> [options]

Options:
  --copy-project                  Copy the project directory from --old to --new before transfer.
  --dry-run                       Show what would be copied without changing files.
  --no-rewrite-paths              Do not rewrite old project path references in copied chat storage.
  --list                          List workspaceStorage entries and their project roots.
  --user-data-dir <path>          VS Code User data dir. Default: ${defaultUserDataDir}
  --old-storage-id <id>           Use a specific old workspaceStorage directory id.
  --new-storage-id <id>           Use a specific new workspaceStorage directory id.
  -h, --help                      Show this help.

Recommended flow:
  1. If needed, run with --copy-project to copy the old project directory to the new location.
  2. Open the project at the new location in VS Code once, then close VS Code.
  3. Run this script with --old and --new to transfer the workspace storage.
  4. Reopen VS Code at the new location.

Examples:
  ./transfer-copilot-chat-history.mjs --old /old/path/zbori --new /new/path/zbori --copy-project
  ./transfer-copilot-chat-history.mjs --old /old/path/zbori --new /new/path/zbori --dry-run
  ./transfer-copilot-chat-history.mjs --old /old/path/zbori --new /new/path/zbori

What it copies:
  With --copy-project, the whole project directory is copied from --old to --new when --new does not exist.
  Chat folders plus chat-related state keys. It does not overwrite the destination state.vscdb.
  Old project path references in copied chat/session storage are rewritten to the new path by default.
  The destination workspace.json is preserved so VS Code still recognizes the new project root.
  A timestamped backup of the destination workspaceStorage folder is created before copying.`);
}

function copyProjectDirectory(sourceProjectPath, destinationProjectPath, dryRun) {
  const sourcePath = normalizeFsPath(sourceProjectPath);
  const destinationPath = normalizeFsPath(destinationProjectPath);

  assertDirectoryExists(sourcePath, 'source project directory');
  assertSafeProjectCopyPaths(sourcePath, destinationPath);

  if (fs.existsSync(destinationPath)) {
    assertDirectoryExists(destinationPath, 'destination project directory');
    console.log(`Project destination already exists: ${destinationPath}`);
    console.log('Skipping project directory copy.');
    return;
  }

  const destinationParent = path.dirname(destinationPath);

  console.log(`Project source:      ${sourcePath}`);
  console.log(`Project destination: ${destinationPath}`);

  if (dryRun) {
    console.log('Dry run: would create the destination parent directory if needed.');
    console.log('Dry run: would copy the project directory.');
    return;
  }

  fs.mkdirSync(destinationParent, { recursive: true });
  fs.cpSync(sourcePath, destinationPath, { preserveTimestamps: true, recursive: true });
  console.log('Project directory copy complete.');
}

function assertSafeProjectCopyPaths(sourcePath, destinationPath) {
  if (pathContains(sourcePath, destinationPath)) {
    exitWithError('The new project path must not be the old project path or a child of it.');
  }

  if (pathContains(destinationPath, sourcePath)) {
    exitWithError('The old project path must not be inside the new project path.');
  }
}

function pathContains(parentPath, candidatePath) {
  const relativePath = path.relative(parentPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function listWorkspaceStorage(workspaceStorageRoot) {
  assertDirectoryExists(workspaceStorageRoot, 'VS Code workspaceStorage directory');

  const entries = fs.readdirSync(workspaceStorageRoot, { withFileTypes: true })
    .filter((entry) => isWorkspaceStorageEntry(entry))
    .map((entry) => readWorkspaceEntry(workspaceStorageRoot, entry.name))
    .filter((entry) => entry !== undefined)
    .sort((left, right) => left.id.localeCompare(right.id));

  if (entries.length === 0) {
    console.log(`No workspace entries found in ${workspaceStorageRoot}.`);
    return;
  }

  for (const entry of entries) {
    console.log(`${entry.id}\t${entry.folder ?? entry.workspace ?? '(unknown workspace)'}`);
  }
}

function readWorkspaceEntry(workspaceStorageRoot, storageId) {
  const workspaceJsonPath = path.join(workspaceStorageRoot, storageId, workspaceJsonFile);

  if (!fs.existsSync(workspaceJsonPath)) {
    return undefined;
  }

  try {
    const workspaceJson = JSON.parse(fs.readFileSync(workspaceJsonPath, 'utf8'));
    return {
      folder: typeof workspaceJson.folder === 'string' ? workspaceJson.folder : undefined,
      id: storageId,
      path: path.join(workspaceStorageRoot, storageId),
      workspace: typeof workspaceJson.workspace === 'string' ? workspaceJson.workspace : undefined,
    };
  } catch (error) {
    console.warn(`Skipping unreadable ${workspaceJsonPath}: ${error.message}`);
    return undefined;
  }
}

function isWorkspaceStorageEntry(entry) {
  return entry.isDirectory() && /^[0-9a-f]{32}$/iu.test(entry.name);
}

function findWorkspaceStorageDir(workspaceStorageRoot, projectPath, label, options = {}) {
  const normalizedProjectPath = normalizeFsPath(projectPath);
  const expectedUri = pathToFileURL(normalizedProjectPath).href;

  const matches = fs.readdirSync(workspaceStorageRoot, { withFileTypes: true })
    .filter((entry) => isWorkspaceStorageEntry(entry))
    .map((entry) => readWorkspaceEntry(workspaceStorageRoot, entry.name))
    .filter((entry) => entry !== undefined)
    .filter((entry) => {
      return entry.folder !== undefined && workspaceEntryMatchesPath(entry.folder, normalizedProjectPath, expectedUri);
    });

  if (matches.length === 0) {
    const missingEntryMessage = [
      `Could not find a workspaceStorage entry for the ${label}: ${normalizedProjectPath}`,
      '',
      'Open that project location in VS Code once, close VS Code, then run this script again.',
      `You can inspect available entries with: ${path.basename(process.argv[1])} --list`,
    ].join('\n');

    if (options.allowMissing === true) {
      console.log(missingEntryMessage);
      return undefined;
    }

    exitWithError(missingEntryMessage);
  }

  if (matches.length > 1) {
    const choices = matches.map((match) => `  ${match.id} -> ${match.folder}`).join('\n');
    exitWithError([
      `Found multiple workspaceStorage entries for the ${label}.`,
      choices,
      '',
      `Run again with ${label.startsWith('old') ? '--old-storage-id' : '--new-storage-id'} <id>.`,
    ].join('\n'));
  }

  return matches[0].path;
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

function storageDirFromId(workspaceStorageRoot, storageId, optionName) {
  const candidateDir = path.join(workspaceStorageRoot, storageId);
  assertDirectoryExists(candidateDir, optionName);
  assertFileExists(path.join(candidateDir, workspaceJsonFile), `${optionName} workspace.json`);
  return candidateDir;
}

function transferWorkspaceStorage({
  sourceDir,
  destinationDir,
  sourceProjectPath,
  destinationProjectPath,
  dryRun,
  rewritePaths,
}) {
  assertDirectoryExists(sourceDir, 'source workspaceStorage entry');
  assertDirectoryExists(destinationDir, 'destination workspaceStorage entry');
  assertFileExists(path.join(sourceDir, workspaceJsonFile), 'source workspace.json');
  assertFileExists(path.join(destinationDir, workspaceJsonFile), 'destination workspace.json');

  const backupDir = uniqueBackupPath(destinationDir);
  const sourceEntries = fs.readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => shouldCopyChatStorageEntry(entry.name));

  console.log(`Source:      ${sourceDir}`);
  console.log(`Destination: ${destinationDir}`);
  console.log(`Backup:      ${backupDir}`);
  console.log('Preserving:  destination workspace.json and non-chat VS Code state');
  console.log(`Path rewrite: ${rewritePaths ? 'enabled' : 'disabled'}`);

  if (dryRun) {
    console.log('\nDry run only. No files were changed.');
    console.log(`Would back up destination to ${backupDir}.`);
    for (const entry of sourceEntries) {
      console.log(`Would copy ${entry.name}`);
    }
    printChatStateMergePlan(sourceDir);
    if (rewritePaths) {
      printRewritePlan(sourceProjectPath, destinationProjectPath);
    }
    return;
  }

  fs.cpSync(destinationDir, backupDir, { preserveTimestamps: true, recursive: true });

  for (const entry of sourceEntries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);

    fs.rmSync(destinationPath, { force: true, recursive: true });
    fs.cpSync(sourcePath, destinationPath, { preserveTimestamps: true, recursive: true });
  }

  mergeChatStateKeys({
    sourceDir,
    destinationDir,
  });

  if (rewritePaths) {
    rewriteProjectReferences({
      storageDir: destinationDir,
      sourceProjectPath,
      destinationProjectPath,
    });
  }

  console.log('\nTransfer complete. Reopen VS Code at the new project location.');
}

function shouldCopyChatStorageEntry(entryName) {
  return chatStorageEntryNames.has(entryName);
}

function printChatStateMergePlan(sourceDir) {
  const sourceDatabasePath = path.join(sourceDir, 'state.vscdb');

  if (!fs.existsSync(sourceDatabasePath)) {
    console.log('Would merge chat state keys: source state.vscdb is missing.');
    return;
  }

  const result = runCommand('sqlite3', [sourceDatabasePath, createChatStateKeySummarySql()]);

  if (result.status !== 0) {
    console.log(`Would merge chat state keys, but could not inspect source DB: ${result.stderr.trim()}`);
    return;
  }

  console.log('Would merge chat state keys:');
  console.log(result.stdout.trim() === '' ? '  none found' : result.stdout.trim());
}

function mergeChatStateKeys({ sourceDir, destinationDir }) {
  const sourceDatabasePath = path.join(sourceDir, 'state.vscdb');
  const destinationDatabasePath = path.join(destinationDir, 'state.vscdb');

  if (!fs.existsSync(sourceDatabasePath) || !fs.existsSync(destinationDatabasePath)) {
    console.log('Skipped chat state key merge because source or destination state.vscdb is missing.');
    return;
  }

  const result = runCommand('sqlite3', [destinationDatabasePath, createChatStateKeyMergeSql(sourceDatabasePath)]);

  if (result.status !== 0) {
    exitWithError(`Failed to merge chat state keys: ${result.stderr.trim() || result.stdout.trim()}`);
  }

  console.log(`Merged ${result.stdout.trim() || 0} chat state rows into destination state.vscdb.`);
}

function createChatStateKeySummarySql() {
  return [
    'SELECT key || char(9) || length(value)',
    'FROM ItemTable',
    `WHERE key IN (${chatStateKeyNames.map(sqliteQuote).join(', ')})`,
    'ORDER BY key;',
  ].join(' ');
}

function createChatStateKeyMergeSql(sourceDatabasePath) {
  const quotedKeys = chatStateKeyNames.map(sqliteQuote).join(', ');

  return [
    `ATTACH DATABASE ${sqliteQuote(sourceDatabasePath)} AS source_state;`,
    'BEGIN;',
    `DELETE FROM ItemTable WHERE key IN (${quotedKeys});`,
    'INSERT INTO ItemTable(key, value)',
    'SELECT key, value FROM source_state.ItemTable',
    `WHERE key IN (${quotedKeys});`,
    'SELECT changes();',
    'COMMIT;',
    'DETACH DATABASE source_state;',
  ].join('\n');
}

function printRewritePlan(sourceProjectPath, destinationProjectPath) {
  const replacements = createProjectPathReplacements(sourceProjectPath, destinationProjectPath);

  console.log('Would rewrite copied project path references:');
  for (const replacement of replacements) {
    console.log(`  ${replacement.from} -> ${replacement.to}`);
  }
}

function rewriteProjectReferences({ storageDir, sourceProjectPath, destinationProjectPath }) {
  const replacements = createProjectPathReplacements(sourceProjectPath, destinationProjectPath);
  const rewriteStats = {
    databaseRows: 0,
    files: 0,
  };

  rewriteTextFiles(storageDir, replacements, rewriteStats);
  rewriteWorkspaceStateDatabases(storageDir, replacements, rewriteStats);

  console.log([
    `Rewrote project path references in ${rewriteStats.files} files`,
    `and ${rewriteStats.databaseRows} DB rows.`,
  ].join(' '));
}

function createProjectPathReplacements(sourceProjectPath, destinationProjectPath) {
  const sourcePath = normalizeFsPath(sourceProjectPath);
  const destinationPath = normalizeFsPath(destinationProjectPath);
  const sourceUri = pathToFileURL(sourcePath).href;
  const destinationUri = pathToFileURL(destinationPath).href;

  return uniqueReplacements([
    { from: sourceUri, to: destinationUri },
    { from: sourcePath, to: destinationPath },
  ]);
}

function uniqueReplacements(replacements) {
  const seen = new Set();

  return replacements.filter((replacement) => {
    if (replacement.from === replacement.to || seen.has(replacement.from)) {
      return false;
    }

    seen.add(replacement.from);
    return true;
  });
}

function rewriteTextFiles(storageDir, replacements, rewriteStats) {
  const filePaths = collectTextRewriteCandidates(storageDir);

  for (const filePath of filePaths) {
    const originalContent = fs.readFileSync(filePath, 'utf8');
    const rewrittenContent = applyReplacements(originalContent, replacements);

    if (rewrittenContent === originalContent) {
      continue;
    }

    fs.writeFileSync(filePath, rewrittenContent);
    rewriteStats.files += 1;
  }
}

function collectTextRewriteCandidates(directoryPath) {
  const candidates = [];
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      candidates.push(...collectTextRewriteCandidates(entryPath));
      continue;
    }

    if (entry.isFile() && isTextRewriteCandidate(entry.name)) {
      candidates.push(entryPath);
    }
  }

  return candidates;
}

function isTextRewriteCandidate(fileName) {
  return fileName.endsWith('.json') || fileName.endsWith('.jsonl') || fileName.endsWith('.txt');
}

function rewriteWorkspaceStateDatabases(storageDir, replacements, rewriteStats) {
  for (const databaseName of workspaceStateDbFiles) {
    const databasePath = path.join(storageDir, databaseName);

    if (!fs.existsSync(databasePath)) {
      continue;
    }

    rewriteStats.databaseRows += rewriteWorkspaceStateDatabase(databasePath, replacements);
  }
}

function rewriteWorkspaceStateDatabase(databasePath, replacements) {
  const sqliteArgs = [databasePath, createSqliteRewriteScript(replacements)];
  const result = runCommand('sqlite3', sqliteArgs);

  if (result.status !== 0) {
    exitWithError(`Failed to rewrite ${databasePath}: ${result.stderr.trim() || result.stdout.trim()}`);
  }

  const trimmedOutput = result.stdout.trim();
  return trimmedOutput === '' ? 0 : Number(trimmedOutput);
}

function createSqliteRewriteScript(replacements) {
  const expressions = replacements.reduce((currentExpression, replacement) => {
    return `replace(${currentExpression}, ${sqliteQuote(replacement.from)}, ${sqliteQuote(replacement.to)})`;
  }, 'CAST(value AS TEXT)');

  const whereClause = replacements.map((replacement) => `CAST(value AS TEXT) LIKE ${sqliteLike(replacement.from)}`)
    .join(' OR ');

  return [
    'BEGIN;',
    `UPDATE ItemTable SET value = CAST(${expressions} AS BLOB) WHERE ${whereClause};`,
    'SELECT changes();',
    'COMMIT;',
  ].join('\n');
}

function sqliteLike(value) {
  return sqliteQuote(`%${value}%`);
}

function sqliteQuote(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function runCommand(command, args) {
  return spawnSync(command, args, { encoding: 'utf8' });
}

function applyReplacements(content, replacements) {
  return replacements.reduce((currentContent, replacement) => {
    return currentContent.split(replacement.from).join(replacement.to);
  }, content);
}

function uniqueBackupPath(destinationDir) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const basePath = `${destinationDir}.backup-${timestamp}`;

  if (!fs.existsSync(basePath)) {
    return basePath;
  }

  for (let suffix = 1; suffix < 100; suffix += 1) {
    const candidatePath = `${basePath}-${suffix}`;
    if (!fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  exitWithError(`Could not create a unique backup path for ${destinationDir}.`);
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
