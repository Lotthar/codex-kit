#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TASK_TYPES = [
  'feature',
  'bugfix',
  'refactor',
  'test',
  'docs',
  'migration',
  'debugging',
  'code-review',
  'performance',
  'security',
];

const CLASSIFIER = [
  ['security', ['security', 'vulnerability', 'auth', 'permission', 'injection', 'xss', 'csrf']],
  ['performance', ['slow', 'performance', 'optimize', 'latency']],
  ['code-review', ['review', 'audit', 'inspect']],
  ['debugging', ['debug', 'investigate', 'why']],
  ['migration', ['migration', 'schema', 'database']],
  ['docs', ['docs', 'readme', 'documentation']],
  ['test', ['test', 'coverage', 'spec']],
  ['refactor', ['refactor', 'cleanup', 'simplify', 'restructure']],
  ['bugfix', ['fix', 'bug', 'error', 'crash', 'broken']],
  ['feature', ['add', 'create', 'implement', 'support']],
];

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'coverage',
  '.turbo',
  '.cache',
  'vendor',
  'target',
  'out',
  'tmp',
  '.dart_tool',
  '.quarkus',
  'Pods',
]);

const IGNORE_FILES = [
  /^\.env($|\.)/,
  /\.pem$/i,
  /\.key$/i,
  /(^|\/)package-lock\.json$/i,
  /(^|\/)yarn\.lock$/i,
  /(^|\/)pnpm-lock\.yaml$/i,
  /(^|\/)bun\.lockb$/i,
  /(^|\/)pubspec\.lock$/i,
  /(^|\/)poetry\.lock$/i,
  /(^|\/)Gemfile\.lock$/i,
  /(^|\/)composer\.lock$/i,
];

const SECRET_PATTERNS = [
  /OPENAI_API_KEY\s*=\s*[^\s]+/gi,
  /STRIPE_SECRET_KEY\s*=\s*[^\s]+/gi,
  /DATABASE_URL\s*=\s*[^\s]+/gi,
  /AWS_SECRET_ACCESS_KEY\s*=\s*[^\s]+/gi,
  /GITHUB_TOKEN\s*=\s*[^\s]+/gi,
  /PRIVATE_KEY\s*=\s*[^\n]+/gi,
  /JWT_SECRET\s*=\s*[^\s]+/gi,
  /(?:TOKEN|PASSWORD|SECRET)\s*=\s*[^\s]+/gi,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /gh[pousr]_[A-Za-z0-9_]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{20,}/g,
];

function printHelp() {
  console.log([
    'promptx - repo-aware Codex prompt enhancer',
    '',
    'Usage:',
    '  node tools/promptx/promptx.mjs "Add invoice CSV export"',
    '  node tools/promptx/promptx.mjs --profile',
    '  node tools/promptx/promptx.mjs --refresh-profile',
    '  node tools/promptx/promptx.mjs --help',
    '',
    'The tool inspects repository metadata, ranks likely files, and prints a structured Codex prompt.',
  ].join('\n'));
}

function safeRead(filePath, maxBytes = 200000) {
  if (!fs.existsSync(filePath) || shouldIgnorePath(filePath)) return '';
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size > maxBytes) return '';
  return redactSecrets(fs.readFileSync(filePath, 'utf8'));
}

function readJson(filePath) {
  try {
    return JSON.parse(safeRead(filePath));
  } catch {
    return null;
  }
}

function runGit(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function findRepoRoot(start = process.cwd()) {
  const gitRoot = runGit(['rev-parse', '--show-toplevel'], start);
  if (gitRoot) return { root: gitRoot, isGitRepo: true };
  return { root: start, isGitRepo: false };
}

function shouldIgnorePath(filePath) {
  const normalized = filePath.split(path.sep).join('/');
  const parts = normalized.split('/');
  if (parts.some((part) => IGNORE_DIRS.has(part))) return true;
  return IGNORE_FILES.some((pattern) => pattern.test(normalized));
}

function discoverFiles(root) {
  const gitFiles = runGit(['ls-files'], root)
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => !shouldIgnorePath(entry));
  if (gitFiles.length > 0) return gitFiles;

  const found = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (shouldIgnorePath(relative)) continue;
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile()) {
        found.push(relative);
      }
    }
  }
  walk(root);
  return found;
}

function detectPackageManager(root) {
  const pkg = readJson(path.join(root, 'package.json'));
  if (pkg && typeof pkg.packageManager === 'string') {
    if (pkg.packageManager.startsWith('pnpm')) return 'pnpm';
    if (pkg.packageManager.startsWith('yarn')) return 'yarn';
    if (pkg.packageManager.startsWith('bun')) return 'bun';
    if (pkg.packageManager.startsWith('npm')) return 'npm';
  }
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml')) || fs.existsSync(path.join(root, 'pnpm-workspace.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(root, 'bun.lockb'))) return 'bun';
  if (fs.existsSync(path.join(root, 'package-lock.json')) || fs.existsSync(path.join(root, 'package.json'))) return 'npm';
  return 'unknown';
}

function detectLanguages(files) {
  const byExt = new Map([
    ['.js', 'JavaScript'],
    ['.mjs', 'JavaScript'],
    ['.cjs', 'JavaScript'],
    ['.ts', 'TypeScript'],
    ['.tsx', 'TypeScript'],
    ['.jsx', 'JavaScript'],
    ['.dart', 'Dart'],
    ['.java', 'Java'],
    ['.kt', 'Kotlin'],
    ['.swift', 'Swift'],
    ['.go', 'Go'],
    ['.rs', 'Rust'],
    ['.py', 'Python'],
    ['.rb', 'Ruby'],
    ['.php', 'PHP'],
    ['.yaml', 'YAML'],
    ['.yml', 'YAML'],
    ['.md', 'Markdown'],
    ['.html', 'HTML'],
    ['.css', 'CSS'],
  ]);
  return [...new Set(files.map((file) => byExt.get(path.extname(file))).filter(Boolean))].sort();
}

function detectFrameworks(root, files) {
  const frameworks = new Set();
  const packageJson = readJson(path.join(root, 'package.json'));
  const deps = packageJson ? Object.assign({}, packageJson.dependencies, packageJson.devDependencies) : {};
  const depNames = Object.keys(deps);

  if (files.some((file) => file.endsWith('pubspec.yaml'))) frameworks.add('Flutter');
  if (files.some((file) => file.endsWith('pom.xml')) && files.some((file) => safeRead(path.join(root, file), 500000).includes('quarkus'))) frameworks.add('Quarkus');
  if (files.some((file) => file.endsWith('go.mod'))) frameworks.add('Go modules');
  if (files.some((file) => file.endsWith('Cargo.toml'))) frameworks.add('Cargo');
  if (files.some((file) => file.endsWith('pyproject.toml'))) frameworks.add('Python project');
  if (depNames.includes('next') || files.some((file) => file.startsWith('next.config.'))) frameworks.add('Next.js');
  if (depNames.includes('vite') || files.some((file) => file.startsWith('vite.config.'))) frameworks.add('Vite');
  if (depNames.includes('react')) frameworks.add('React');
  if (depNames.includes('vue')) frameworks.add('Vue');
  if (files.some((file) => file.endsWith('turbo.json'))) frameworks.add('Turborepo');
  if (files.some((file) => file.endsWith('nx.json'))) frameworks.add('Nx');
  if (files.some((file) => file.includes('docker-compose') || file.startsWith('infra/Dockerfile'))) frameworks.add('Docker');
  return [...frameworks].sort();
}

function detectCommands(root, packageManager, files) {
  const commands = {};
  const packageJson = readJson(path.join(root, 'package.json'));
  if (packageJson && packageJson.scripts) {
    for (const [name, value] of Object.entries(packageJson.scripts)) {
      commands[name] = packageManager === 'unknown' ? 'npm run ' + name : packageManager + ' run ' + name;
      if (typeof value === 'string' && /lint/i.test(name)) commands.lint = commands[name];
      if (typeof value === 'string' && /test/i.test(name)) commands.test = commands[name];
      if (typeof value === 'string' && /type|check/i.test(name)) commands.typecheck = commands[name];
    }
  }

  const makefile = safeRead(path.join(root, 'Makefile'));
  if (makefile) {
    const targets = [...makefile.matchAll(/^([A-Za-z0-9_.:-]+):/gm)].map((match) => match[1]);
    for (const target of targets) {
      if (/test/i.test(target)) commands[target] = 'make ' + target;
      if (/lint/i.test(target)) commands[target] = 'make ' + target;
      if (/bootstrap/i.test(target)) commands[target] = 'make ' + target;
    }
    if (targets.includes('mobile-test')) commands['mobile-test'] = 'make mobile-test';
    if (targets.includes('api-test')) commands['api-test'] = 'make api-test';
  }

  if (files.some((file) => file.endsWith('pubspec.yaml'))) {
    commands['flutter-analyze'] = 'cd apps/mobile && flutter analyze';
    commands['flutter-test'] = 'cd apps/mobile && flutter test';
  }
  if (files.some((file) => file.endsWith('mvnw'))) {
    commands['maven-test'] = 'cd services/api && ./mvnw test';
  }
  return commands;
}

function collectDocs(files) {
  return files
    .filter((file) => /(^|\/)(README|CONTRIBUTING|AGENTS)\.md$/i.test(file) || file.startsWith('docs/'))
    .filter((file) => !shouldIgnorePath(file))
    .sort();
}

function profileImportantPaths(files) {
  const paths = {};
  for (const candidate of ['src', 'app', 'apps', 'packages', 'services', 'docs', 'tools', 'infra', 'test', 'tests']) {
    if (files.some((file) => file === candidate || file.startsWith(candidate + '/'))) {
      paths[candidate] = candidate + '/';
    }
  }
  return paths;
}

function buildRepoProfile(rootInfo = findRepoRoot()) {
  const files = discoverFiles(rootInfo.root);
  const sourceFiles = files
    .filter((file) => /\.(js|mjs|cjs|ts|tsx|jsx|dart|java|kt|swift|go|rs|py|rb|php|html|css)$/i.test(file))
    .filter((file) => !/(^|\/)(test|tests|__tests__)\/|Test\.java$|_test\.dart$|\.test\.|\.spec\./.test(file))
    .slice(0, 500);
  const testFiles = files
    .filter((file) => /(^|\/)(test|tests|__tests__)\/|Test\.java$|_test\.dart$|\.test\.|\.spec\./.test(file))
    .slice(0, 500);
  const packageManager = detectPackageManager(rootInfo.root);
  return {
    generatedAt: new Date().toISOString(),
    root: rootInfo.root,
    packageManager,
    languages: detectLanguages(files),
    frameworks: detectFrameworks(rootInfo.root, files),
    commands: detectCommands(rootInfo.root, packageManager, files),
    docs: collectDocs(files),
    sourceFiles,
    testFiles,
    importantPaths: profileImportantPaths(files),
    notes: rootInfo.isGitRepo ? [] : ['Not inside a git repository; file discovery used recursive walking.'],
  };
}

function cachePath(root) {
  return path.join(root, '.promptx', 'repo_profile.json');
}

function writeProfile(rootInfo = findRepoRoot()) {
  const profile = buildRepoProfile(rootInfo);
  fs.mkdirSync(path.dirname(cachePath(rootInfo.root)), { recursive: true });
  fs.writeFileSync(cachePath(rootInfo.root), JSON.stringify(profile, null, 2) + '\n');
  return profile;
}

function readOrBuildProfile(rootInfo = findRepoRoot(), refresh = false) {
  const profileFile = cachePath(rootInfo.root);
  if (!refresh && fs.existsSync(profileFile)) {
    const cached = readJson(profileFile);
    if (cached) return cached;
  }
  return writeProfile(rootInfo);
}

function classifyTask(prompt) {
  const text = prompt.toLowerCase();
  for (const [type, keywords] of CLASSIFIER) {
    if (keywords.some((keyword) => keywordInText(text, keyword))) return type;
  }
  return 'feature';
}

function keywordInText(text, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^a-z0-9])' + escaped + '([^a-z0-9]|$)', 'i').test(text);
}

function promptTerms(prompt) {
  return [...new Set(prompt
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 2)
    .filter((term) => !['the', 'and', 'for', 'with', 'without', 'into', 'from', 'this', 'that'].includes(term)))];
}

function rankRelevantFiles(prompt, profile) {
  const terms = promptTerms(prompt);
  const candidates = [...new Set([...(profile.sourceFiles || []), ...(profile.testFiles || []), ...(profile.docs || [])])]
    .filter((file) => !shouldIgnorePath(file));

  const scored = candidates.map((file) => {
    const lower = file.toLowerCase();
    const baseName = path.basename(lower);
    const segments = lower.split('/');
    let score = 0;
    for (const term of terms) {
      if (lower.includes(term)) score += 5;
      if (baseName.includes(term)) score += 8;
      if (segments.includes(term)) score += 6;
      if ((term.endsWith('s') ? term.slice(0, -1) : term).length > 2 && lower.includes(term.endsWith('s') ? term.slice(0, -1) : term)) score += 2;
    }
    if (/^(src|app|apps|packages|services)\//.test(lower)) score += 2;
    if (/(^|\/)(test|tests|__tests__)\/|test\.java$|_test\.dart$|\.test\.|\.spec\./.test(lower)) score += 2;
    if (/readme|docs\//.test(lower)) score += 1;
    return { file, score };
  }).filter((entry) => entry.score > 0);

  const selected = scored.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file)).slice(0, 20).map((entry) => entry.file);
  if (selected.length >= 10) return selected;

  const fallback = candidates
    .filter((file) => /^(apps|services|src|app|packages|docs)\//.test(file))
    .slice(0, 20 - selected.length);
  return [...new Set([...selected, ...fallback])].slice(0, 20);
}

function chooseVerificationCommands(taskType, profile) {
  const commands = profile.commands || {};
  const picked = [];
  if (commands['mobile-test']) picked.push(commands['mobile-test']);
  if (commands['api-test']) picked.push(commands['api-test']);
  if (commands.test && !picked.includes(commands.test)) picked.push(commands.test);
  if (commands['flutter-test'] && !picked.includes(commands['flutter-test'])) picked.push(commands['flutter-test']);
  if (commands['maven-test'] && !picked.includes(commands['maven-test'])) picked.push(commands['maven-test']);
  if (taskType === 'docs') picked.unshift('Review rendered Markdown or docs preview if available');
  if (taskType === 'performance') picked.push('Capture before/after timing or profiling evidence for the changed path');
  if (taskType === 'security') picked.push('Run targeted regression tests for auth, permission, and malformed input cases');
  return [...new Set(picked)].slice(0, 8);
}

function repoSummary(profile) {
  const pieces = [];
  pieces.push('- Root: `' + redactSecrets(profile.root || process.cwd()) + '`');
  pieces.push('- Package manager: `' + (profile.packageManager || 'unknown') + '`');
  pieces.push('- Languages: ' + ((profile.languages || []).length ? profile.languages.join(', ') : 'unknown'));
  pieces.push('- Frameworks/tools: ' + ((profile.frameworks || []).length ? profile.frameworks.join(', ') : 'none detected'));
  if ((profile.docs || []).length) pieces.push('- Docs: ' + profile.docs.slice(0, 8).map((file) => '`' + file + '`').join(', '));
  if ((profile.notes || []).length) pieces.push('- Notes: ' + profile.notes.join(' '));
  return pieces.join('\n');
}

function formatList(items, fallback) {
  if (!items || items.length === 0) return fallback;
  return items.map((item) => '- `' + redactSecrets(item) + '`').join('\n');
}

function inferGoal(task) {
  return 'Complete the requested change with minimal, repo-consistent edits, clear verification, and no unrelated refactors: ' + task;
}

function patterns(profile, files) {
  const lines = [];
  lines.push('- Follow existing naming, layout, and architecture in the nearest relevant files.');
  if ((profile.docs || []).includes('AGENTS.md')) lines.push('- Follow local `AGENTS.md` guidance before editing.');
  if ((profile.frameworks || []).length) lines.push('- Reuse detected project conventions for ' + profile.frameworks.join(', ') + '.');
  if (files.some((file) => /test|Test\.java|_test\.dart/.test(file))) lines.push('- Mirror the style of nearby tests in the listed test files.');
  return lines.join('\n');
}

function constraints(taskType) {
  const lines = [
    '- Do not read or print `.env`, private key, cookie, token, or secret files.',
    '- Keep edits scoped to the requested task.',
    '- Preserve existing public contracts unless the task explicitly changes them.',
    '- Prefer targeted file reads and targeted tests before broad checks.',
  ];
  if (taskType === 'security') lines.push('- Treat auth, permissions, tokens, and externally supplied input as high risk.');
  if (taskType === 'migration') lines.push('- Plan migration safety, compatibility, and rollback before changing schema or data.');
  if (taskType === 'refactor') lines.push('- Preserve behavior and API compatibility.');
  return lines.join('\n');
}

function doneCriteria(taskType) {
  const base = [
    '- The requested behavior is implemented or the investigation answer is evidence-backed.',
    '- Relevant tests or checks have passed, or skipped commands are explicitly explained.',
    '- The final response lists changed files, commands run, assumptions, and remaining risks.',
  ];
  if (taskType === 'bugfix') base.unshift('- A regression test or equivalent targeted check covers the fixed behavior.');
  if (taskType === 'docs') base.unshift('- Documentation is accurate against the current code and commands.');
  if (taskType === 'security') base.unshift('- Sensitive data is not logged, exposed, or committed.');
  return base.join('\n');
}

function taskTypeSections(taskType) {
  const sections = {
    feature: [
      ['Expected behavior', 'Describe the user-visible behavior, edge cases, and failure states before editing.'],
      ['API/UI/data contract considerations', 'Identify any route, UI, storage, or data contract changes and keep them compatible where possible.'],
      ['Tests to add or update', 'Add or update focused tests for the new behavior and important edge cases.'],
    ],
    bugfix: [
      ['Reproduction guidance', 'Find or create the smallest reproduction before changing code when feasible.'],
      ['Expected vs actual behavior', 'State the observed failure and the corrected behavior.'],
      ['Regression test expectations', 'Add or update a regression test that would have caught the bug.'],
    ],
    refactor: [
      ['Refactor invariants', 'List behavior, contracts, and data shape that must remain unchanged.'],
      ['Compatibility constraints', 'Avoid breaking public APIs, persistence formats, and integration points.'],
      ['Behavior that must not change', 'Verify existing behavior with targeted tests before broad cleanup.'],
    ],
    test: [
      ['Coverage target', 'Identify the behavior, branch, or component that needs coverage.'],
      ['Test cases to consider', 'Cover success, failure, edge, and regression cases relevant to the prompt.'],
      ['Existing test patterns', 'Reuse nearby factories, helpers, naming, and assertion style.'],
    ],
    docs: [
      ['Documentation scope', 'Update only documentation required by the requested change.'],
      ['Existing docs to update', 'Prefer nearby README, docs, or inline operational notes already used by the repo.'],
      ['Accuracy checks', 'Check commands, paths, and behavior against the current repository.'],
    ],
    migration: [
      ['Migration safety', 'Plan forward migration, data preservation, and idempotency before editing.'],
      ['Backward compatibility', 'Consider old readers/writers, deploy ordering, and mixed-version operation.'],
      ['Rollback considerations', 'Describe rollback limits and any required backup or repair path.'],
    ],
    debugging: [
      ['Investigation plan', 'Collect evidence before changing code; keep hypotheses explicit.'],
      ['Evidence to collect', 'Gather current logs, exact errors, reproduction steps, and relevant state.'],
      ['Hypotheses to verify', 'Test likely causes one at a time and summarize what each result means.'],
    ],
    'code-review': [
      ['Review focus', 'Prioritize correctness, regressions, security, performance, and missing tests.'],
      ['Risk areas', 'Call out high-risk files, public contracts, auth, persistence, migrations, and async behavior.'],
      ['Review output format', 'Lead with findings ordered by severity and include file/line references when available.'],
    ],
    performance: [
      ['Performance hypothesis', 'State what is slow and why before optimizing.'],
      ['Measurement plan', 'Capture before/after evidence with the narrowest reliable benchmark or trace.'],
      ['Avoided tradeoffs', 'Avoid readability, correctness, or safety regressions without measured benefit.'],
    ],
    security: [
      ['Security constraints', 'Do not expose secrets, weaken auth, or broaden permissions.'],
      ['Threat model', 'Identify attacker-controlled inputs, trust boundaries, and sensitive assets.'],
      ['Sensitive data handling', 'Ensure tokens, passwords, keys, cookies, and private URLs are redacted and never logged.'],
      ['Abuse cases to test', 'Test malformed input, unauthorized access, replay, injection, and privilege-boundary cases as relevant.'],
    ],
  };
  return (sections[taskType] || []).map(([heading, body]) => '# ' + heading + '\n\n' + body).join('\n\n');
}

function buildEnhancedPrompt(task, options = {}) {
  const rootInfo = options.rootInfo || findRepoRoot();
  const profile = options.profile || readOrBuildProfile(rootInfo);
  const taskType = classifyTask(task);
  const relevantFiles = rankRelevantFiles(task, profile);
  const verification = chooseVerificationCommands(taskType, profile);
  const extraSections = taskTypeSections(taskType);
  return redactSecrets([
    '# Task',
    '',
    task,
    '',
    '# Goal',
    '',
    inferGoal(task),
    '',
    '# Task type',
    '',
    taskType,
    '',
    '# Current repo context',
    '',
    repoSummary(profile),
    '',
    '# Relevant files to inspect first',
    '',
    formatList(relevantFiles, '- No strong file matches found; start with `AGENTS.md`, repo docs, and targeted search for domain terms.'),
    '',
    '# Existing patterns to follow',
    '',
    patterns(profile, relevantFiles),
    '',
    '# Constraints',
    '',
    constraints(taskType),
    '',
    '# Suggested approach',
    '',
    '1. Read `AGENTS.md` and relevant docs first.',
    '2. Inspect the listed files before editing.',
    '3. Identify the smallest safe implementation plan.',
    '4. Reuse existing abstractions and conventions.',
    '5. Add or update tests for behavior changes.',
    '6. Run the most specific verification commands available.',
    '7. Summarize changed files, commands run, and remaining risks.',
    '',
    '# Verification',
    '',
    verification.length ? verification.map((command) => '- `' + command + '`').join('\n') : '- No specific command detected; run the narrowest relevant check available in this repo.',
    '',
    '# Done when',
    '',
    doneCriteria(taskType),
    '',
    '# Output expectations',
    '',
    'At the end, report:',
    '',
    '- Files changed',
    '- Tests or commands run',
    '- Commands that could not be run',
    '- Assumptions made',
    '- Remaining risks',
    '',
    extraSections,
    '',
  ].join('\n'));
}

function redactSecrets(value) {
  let output = String(value);
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, (match) => {
      const keyMatch = match.match(/^([A-Z0-9_]+)\s*=/i);
      return keyMatch ? keyMatch[1] + '=[REDACTED]' : '[REDACTED]';
    });
  }
  return output;
}

function main(argv = process.argv.slice(2)) {
  const rootInfo = findRepoRoot();
  if (!rootInfo.isGitRepo) {
    console.warn('Warning: not inside a git repository; file discovery will use recursive walking.');
  }

  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return;
  }

  if (argv.includes('--refresh-profile')) {
    const profile = writeProfile(rootInfo);
    console.log(JSON.stringify(profile, null, 2));
    return;
  }

  if (argv.includes('--profile')) {
    const profile = readOrBuildProfile(rootInfo);
    console.log(JSON.stringify(profile, null, 2));
    return;
  }

  const prompt = argv.filter((arg) => !arg.startsWith('--')).join(' ').trim();
  if (!prompt) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  console.log(buildEnhancedPrompt(prompt, { rootInfo }));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}

export {
  buildEnhancedPrompt,
  buildRepoProfile,
  classifyTask,
  detectCommands,
  detectFrameworks,
  detectLanguages,
  detectPackageManager,
  discoverFiles,
  findRepoRoot,
  rankRelevantFiles,
  redactSecrets,
};
