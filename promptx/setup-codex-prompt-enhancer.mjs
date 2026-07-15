#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const startDir = process.cwd();

function runGit(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function findRepoRoot() {
  const gitRoot = runGit(['rev-parse', '--show-toplevel'], startDir);
  if (gitRoot) return { root: gitRoot, isGitRepo: true };
  return { root: startDir, isGitRepo: false };
}

const repo = findRepoRoot();
if (!repo.isGitRepo) {
  console.warn('Warning: not inside a git repository; promptx file discovery will be less accurate.');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeIfMissing(relativePath, content) {
  const absolutePath = path.join(repo.root, relativePath);
  ensureDir(path.dirname(absolutePath));
  if (fs.existsSync(absolutePath)) return false;
  fs.writeFileSync(absolutePath, content.endsWith('\n') ? content : content + '\n');
  return true;
}

function upsertManagedSection(relativePath, startMarker, endMarker, section) {
  const absolutePath = path.join(repo.root, relativePath);
  ensureDir(path.dirname(absolutePath));
  const block = startMarker + '\n' + section.trim() + '\n' + endMarker;
  if (!fs.existsSync(absolutePath)) {
    fs.writeFileSync(absolutePath, '# Repository Guidance\n\n' + block + '\n');
    return 'created';
  }

  const current = fs.readFileSync(absolutePath, 'utf8');
  const start = current.indexOf(startMarker);
  const end = current.indexOf(endMarker);
  if (start !== -1 && end !== -1 && end > start) {
    const next = current.slice(0, start) + block + current.slice(end + endMarker.length);
    const normalizedNext = next.endsWith('\n') ? next : next + '\n';
    if (normalizedNext !== current) {
      fs.writeFileSync(absolutePath, normalizedNext);
      return 'updated';
    }
    return 'unchanged';
  }

  const separator = current.endsWith('\n') ? '\n' : '\n\n';
  fs.writeFileSync(absolutePath, current + separator + block + '\n');
  return 'appended';
}

function ensureGitignoreEntry(entry) {
  const trackedPromptx = runGit(['ls-files', '.promptx'], repo.root);
  if (trackedPromptx) return false;
  const gitignorePath = path.join(repo.root, '.gitignore');
  const current = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  const lines = current.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes(entry)) return false;
  const prefix = current && !current.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(gitignorePath, current + prefix + '\n# promptx generated cache\n' + entry + '\n');
  return true;
}

function maybeAddPackageScripts() {
  const packageJsonPath = path.join(repo.root, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return 'skipped: no package.json';
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch {
    return 'skipped: package.json is not valid JSON';
  }
  const scripts = parsed.scripts && typeof parsed.scripts === 'object' ? parsed.scripts : {};
  const additions = {
    promptx: 'node tools/promptx/promptx.mjs',
    'promptx:profile': 'node tools/promptx/promptx.mjs --profile',
    'promptx:refresh': 'node tools/promptx/promptx.mjs --refresh-profile',
  };
  for (const key of Object.keys(additions)) {
    if (scripts[key] && scripts[key] !== additions[key]) {
      return 'skipped: package.json already has promptx scripts';
    }
  }
  parsed.scripts = { ...scripts, ...additions };
  fs.writeFileSync(packageJsonPath, JSON.stringify(parsed, null, 2) + '\n');
  return 'updated';
}

function fallbackPromptxCliSource() {
  return String.raw`#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SECRET_PATTERNS = [/OPENAI_API_KEY\s*=\s*[^\s]+/gi, /STRIPE_SECRET_KEY\s*=\s*[^\s]+/gi, /DATABASE_URL\s*=\s*[^\s]+/gi, /AWS_SECRET_ACCESS_KEY\s*=\s*[^\s]+/gi, /GITHUB_TOKEN\s*=\s*[^\s]+/gi, /PRIVATE_KEY\s*=\s*[^\n]+/gi, /JWT_SECRET\s*=\s*[^\s]+/gi, /(?:TOKEN|PASSWORD|SECRET)\s*=\s*[^\s]+/gi, /sk-[A-Za-z0-9_-]{20,}/g];
const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage', '.turbo', '.cache', 'vendor', 'target', 'out', 'tmp']);
const TYPES = [['security', ['security', 'vulnerability', 'auth', 'permission', 'injection', 'xss', 'csrf']], ['performance', ['slow', 'performance', 'optimize', 'latency']], ['code-review', ['review', 'audit', 'inspect']], ['debugging', ['debug', 'investigate', 'why']], ['migration', ['migration', 'schema', 'database']], ['docs', ['docs', 'readme', 'documentation']], ['test', ['test', 'coverage', 'spec']], ['refactor', ['refactor', 'cleanup', 'simplify', 'restructure']], ['bugfix', ['fix', 'bug', 'error', 'crash', 'broken']], ['feature', ['add', 'create', 'implement', 'support']]];

function redactSecrets(value) {
  let output = String(value);
  for (const pattern of SECRET_PATTERNS) output = output.replace(pattern, '[REDACTED]');
  return output;
}
function git(args, cwd) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
}
function root() {
  const found = git(['rev-parse', '--show-toplevel'], process.cwd());
  return { root: found || process.cwd(), isGitRepo: Boolean(found) };
}
function ignored(file) {
  if (/(\.env($|\.)|\.pem$|\.key$|lock$|lock\.yaml$|lockb$)/i.test(file)) return true;
  return file.split('/').some((part) => IGNORED.has(part));
}
function walk(dir, base, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    const relative = path.relative(base, absolute).split(path.sep).join('/');
    if (ignored(relative)) continue;
    if (entry.isDirectory()) walk(absolute, base, out);
    if (entry.isFile()) out.push(relative);
  }
}
function files(base) {
  const listed = git(['ls-files'], base).split('\n').filter(Boolean).filter((file) => !ignored(file));
  if (listed.length) return listed;
  const out = [];
  walk(base, base, out);
  return out;
}
function classify(prompt) {
  const lower = prompt.toLowerCase();
  for (const [type, words] of TYPES) if (words.some((word) => lower.includes(word))) return type;
  return 'feature';
}
function packageManager(base) {
  if (fs.existsSync(path.join(base, 'pnpm-workspace.yaml')) || fs.existsSync(path.join(base, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(base, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(base, 'bun.lockb'))) return 'bun';
  if (fs.existsSync(path.join(base, 'package.json'))) return 'npm';
  return 'unknown';
}
function profile() {
  const info = root();
  const all = files(info.root);
  const sourceFiles = all.filter((file) => /\.(js|mjs|ts|tsx|dart|java|go|rs|py|rb|php|swift|kt|html|css)$/i.test(file)).slice(0, 500);
  const testFiles = all.filter((file) => /(^|\/)(test|tests|__tests__)\/|Test\.java$|_test\.dart$|\.test\.|\.spec\./.test(file)).slice(0, 500);
  const docs = all.filter((file) => /(^|\/)(README|CONTRIBUTING|AGENTS)\.md$/i.test(file) || file.startsWith('docs/'));
  const frameworks = [];
  if (all.some((file) => file.endsWith('pubspec.yaml'))) frameworks.push('Flutter');
  if (all.some((file) => file.endsWith('pom.xml'))) frameworks.push('Maven/Java');
  if (all.some((file) => file.startsWith('next.config.'))) frameworks.push('Next.js');
  if (all.some((file) => file.startsWith('vite.config.'))) frameworks.push('Vite');
  const commands = {};
  if (fs.existsSync(path.join(info.root, 'Makefile'))) { commands['mobile-test'] = 'make mobile-test'; commands['api-test'] = 'make api-test'; }
  if (all.some((file) => file.endsWith('pubspec.yaml'))) commands['flutter-test'] = 'cd apps/mobile && flutter test';
  if (all.some((file) => file.endsWith('mvnw'))) commands['maven-test'] = 'cd services/api && ./mvnw test';
  return { generatedAt: new Date().toISOString(), root: info.root, packageManager: packageManager(info.root), languages: [], frameworks, commands, docs, sourceFiles, testFiles, importantPaths: {}, notes: info.isGitRepo ? [] : ['Not inside a git repository; file discovery used recursive walking.'] };
}
function writeProfile() {
  const p = profile();
  const output = path.join(p.root, '.promptx', 'repo_profile.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(p, null, 2) + '\n');
  return p;
}
function relevant(prompt, p) {
  const terms = prompt.toLowerCase().replace(/[^a-z0-9_\-\s]/g, ' ').split(/\s+/).filter((term) => term.length > 2);
  return [...new Set([...p.sourceFiles, ...p.testFiles, ...p.docs])]
    .map((file) => ({ file, score: terms.reduce((sum, term) => sum + (file.toLowerCase().includes(term) ? 1 : 0), 0) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
    .slice(0, 20)
    .map((entry) => entry.file);
}
function prompt(task) {
  const p = fs.existsSync(path.join(root().root, '.promptx', 'repo_profile.json')) ? JSON.parse(fs.readFileSync(path.join(root().root, '.promptx', 'repo_profile.json'), 'utf8')) : writeProfile();
  const type = classify(task);
  const files = relevant(task, p);
  const verify = Object.values(p.commands || {}).slice(0, 6);
  const extra = { feature: ['Expected behavior', 'API/UI/data contract considerations', 'Tests to add or update'], bugfix: ['Reproduction guidance', 'Expected vs actual behavior', 'Regression test expectations'], refactor: ['Refactor invariants', 'Compatibility constraints', 'Behavior that must not change'], test: ['Coverage target', 'Test cases to consider', 'Existing test patterns'], docs: ['Documentation scope', 'Existing docs to update', 'Accuracy checks'], migration: ['Migration safety', 'Backward compatibility', 'Rollback considerations'], debugging: ['Investigation plan', 'Evidence to collect', 'Hypotheses to verify'], 'code-review': ['Review focus', 'Risk areas', 'Review output format'], performance: ['Performance hypothesis', 'Measurement plan', 'Avoided tradeoffs'], security: ['Security constraints', 'Threat model', 'Sensitive data handling', 'Abuse cases to test'] }[type] || [];
  return redactSecrets(['# Task', task, '# Goal', 'Complete the requested change with minimal, repo-consistent edits: ' + task, '# Task type', type, '# Current repo context', '- Root: ' + p.root + '\n- Package manager: ' + p.packageManager + '\n- Frameworks/tools: ' + (p.frameworks || []).join(', '), '# Relevant files to inspect first', files.length ? files.map((file) => '- \`' + file + '\`').join('\n') : '- No strong file matches found; use targeted search.', '# Existing patterns to follow', '- Follow existing naming, layout, tests, and architecture in nearby files.', '# Constraints', '- Do not read or print \`.env\`, private key, token, cookie, or secret files.\n- Keep edits scoped.\n- Avoid unrelated refactors.', '# Suggested approach', '1. Read \`AGENTS.md\` and relevant docs first.\n2. Inspect the listed files before editing.\n3. Identify the smallest safe implementation plan.\n4. Reuse existing abstractions and conventions.\n5. Add or update tests for behavior changes.\n6. Run the most specific verification commands available.\n7. Summarize changed files, commands run, and remaining risks.', '# Verification', verify.length ? verify.map((cmd) => '- \`' + cmd + '\`').join('\n') : '- Run the narrowest relevant check available.', '# Done when', '- The task is handled.\n- Relevant checks passed or skipped commands are explained.\n- Risks are summarized.', '# Output expectations', 'At the end, report:\n\n- Files changed\n- Tests or commands run\n- Commands that could not be run\n- Assumptions made\n- Remaining risks', extra.map((heading) => '# ' + heading + '\n\nTBD by the implementing agent.').join('\n\n')].join('\n\n'));
}
function help() {
  console.log('Usage:\n  node tools/promptx/promptx.mjs "Add invoice CSV export"\n  node tools/promptx/promptx.mjs --profile\n  node tools/promptx/promptx.mjs --refresh-profile\n  node tools/promptx/promptx.mjs --help');
}
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) help();
else if (args.includes('--refresh-profile')) console.log(JSON.stringify(writeProfile(), null, 2));
else if (args.includes('--profile')) console.log(JSON.stringify(profile(), null, 2));
else if (args.join(' ').trim()) console.log(prompt(args.join(' ').trim()));
else { help(); process.exitCode = 1; }
`;
}

function existingOrFallbackCliSource() {
  const currentCli = path.join(repo.root, 'tools/promptx/promptx.mjs');
  if (fs.existsSync(currentCli)) return fs.readFileSync(currentCli, 'utf8');
  return fallbackPromptxCliSource();
}

const baseTemplate = `# Task

{{task}}

# Goal

{{goal}}

# Task type

{{task_type}}

# Current repo context

{{repo_summary}}

# Relevant files to inspect first

{{ranked_files}}

# Existing patterns to follow

{{patterns}}

# Constraints

{{constraints}}

# Suggested approach

1. Read \`AGENTS.md\` and relevant docs first.
2. Inspect the listed files before editing.
3. Identify the smallest safe implementation plan.
4. Reuse existing abstractions and conventions.
5. Add or update tests for behavior changes.
6. Run the most specific verification commands available.
7. Summarize changed files, commands run, and remaining risks.

# Verification

{{commands}}

# Done when

{{done_criteria}}

# Output expectations

At the end, report:

- Files changed
- Tests or commands run
- Commands that could not be run
- Assumptions made
- Remaining risks
`;

const taskTemplates = {
  'feature.md': '# Expected behavior\n\nDescribe the new behavior, edge cases, and failure states.\n\n# API/UI/data contract considerations\n\nIdentify contracts that may change and keep compatibility in mind.\n\n# Tests to add or update\n\nCover the new behavior with focused tests.\n',
  'bugfix.md': '# Reproduction guidance\n\nFind the smallest reproduction before editing when feasible.\n\n# Expected vs actual behavior\n\nState the current failure and the corrected behavior.\n\n# Regression test expectations\n\nAdd a test that would have caught the bug.\n',
  'refactor.md': '# Refactor invariants\n\nList behavior and contracts that must remain unchanged.\n\n# Compatibility constraints\n\nAvoid breaking public APIs, persistence formats, and integrations.\n\n# Behavior that must not change\n\nVerify existing behavior with targeted checks.\n',
  'test.md': '# Coverage target\n\nName the behavior or path that needs coverage.\n\n# Test cases to consider\n\nCover success, failure, edge, and regression cases.\n\n# Existing test patterns\n\nReuse nearby helpers, fixtures, and assertion style.\n',
  'docs.md': '# Documentation scope\n\nKeep docs changes focused on the requested topic.\n\n# Existing docs to update\n\nPrefer nearby README, docs, and operational notes.\n\n# Accuracy checks\n\nVerify paths, commands, and behavior against the repo.\n',
  'migration.md': '# Migration safety\n\nPlan idempotency and data preservation before editing.\n\n# Backward compatibility\n\nConsider deploy ordering and mixed-version operation.\n\n# Rollback considerations\n\nDescribe rollback limits and repair steps.\n',
  'debugging.md': '# Investigation plan\n\nCollect evidence before changing code.\n\n# Evidence to collect\n\nGather exact errors, logs, reproduction steps, and relevant state.\n\n# Hypotheses to verify\n\nTest likely causes one at a time.\n',
  'code-review.md': '# Review focus\n\nPrioritize correctness, regressions, security, performance, and tests.\n\n# Risk areas\n\nCall out public contracts, auth, persistence, migrations, and async behavior.\n\n# Review output format\n\nLead with findings ordered by severity and grounded in file references.\n',
  'performance.md': '# Performance hypothesis\n\nState what is slow and why before optimizing.\n\n# Measurement plan\n\nCapture before/after evidence.\n\n# Avoided tradeoffs\n\nAvoid correctness, safety, or readability regressions without measured benefit.\n',
  'security.md': '# Security constraints\n\nDo not expose secrets, weaken auth, or broaden permissions.\n\n# Threat model\n\nIdentify attacker-controlled inputs, trust boundaries, and sensitive assets.\n\n# Sensitive data handling\n\nRedact tokens, passwords, keys, cookies, and private URLs.\n\n# Abuse cases to test\n\nTest malformed input, unauthorized access, replay, injection, and privilege boundaries.\n',
};

const skill = `---
name: prompt-enhancer
description: Use when the user gives a rough coding task and wants it converted into a repo-aware Codex prompt before implementation.
---

You are a repo-aware Codex prompt enhancer.

When invoked:

1. Read active \`AGENTS.md\` guidance.
2. Inspect README, package config, workspace config, and relevant docs.
3. Infer the stack, package manager, test commands, and repo layout.
4. Classify the task as feature, bugfix, refactor, test, docs, migration, debugging, code-review, performance, or security.
5. Use file search to identify likely relevant files.
6. Produce an enhanced Codex prompt.

Rules:

- Do not invent repo facts.
- Do not include secrets or \`.env\` values.
- Keep the final prompt focused.
- Prefer file paths and verification commands over broad descriptions.
- Include assumptions only when clearly marked.
- Ask for clarification only when the task is genuinely blocked.
- Otherwise, produce a best-effort enhanced prompt.
`;

const agentsSection = `## promptx prompt enhancement

- Prefer repo-aware prompts that name the task, goal, relevant files, constraints, verification, and done criteria.
- Read relevant files and docs before editing.
- Follow existing architecture, naming, and local conventions.
- Use the project's package manager and existing scripts when available.
- Run targeted tests or checks when possible.
- Avoid unrelated refactors and broad formatting churn.
- Never expose secrets, \`.env\` values, tokens, private keys, or cookie files.
- Summarize changed files and verification results at the end.`;

function evalExample(title, rough, good, bad) {
  return `# Rough prompt

${rough}

# Expected enhanced prompt properties

- Classifies the task correctly.
- Identifies likely source, test, and documentation files to inspect first.
- Suggests narrow verification commands.
- Calls out constraints and done criteria.

# Good signs

- ${good}
- Uses repo facts without inventing missing details.
- Avoids unrelated implementation work.

# Bad signs

- ${bad}
- Prints secrets or asks to read ignored secret files.
- Gives generic advice with no repo-aware file paths or commands.
`;
}

const evals = {
  '001-feature-invoice-export.md': evalExample('feature invoice export', 'Add invoice CSV export', 'Includes expected behavior, contract considerations, and tests to add.', 'Treats the prompt as a bugfix or skips verification.'),
  '002-bugfix-login-redirect.md': evalExample('bugfix login redirect', 'Fix login redirect bug', 'Includes reproduction guidance and regression test expectations.', 'Jumps to broad auth rewrites without reproduction.'),
  '003-refactor-user-service.md': evalExample('refactor user service', 'Refactor user service without changing behavior', 'Emphasizes invariants, compatibility, and existing tests.', 'Suggests behavior changes or unrelated architecture rewrites.'),
  '004-security-webhook-signature.md': evalExample('security webhook signature', 'Audit webhook signature verification security', 'Includes threat model, sensitive-data handling, and abuse cases.', 'Ignores replay, malformed signatures, or secret handling.'),
};

const readme = `# promptx

promptx turns rough development requests into structured, repo-aware Codex prompts.

It inspects repository metadata, likely source and test files, docs, package/tooling signals, and available verification commands. It favors paths and commands over broad prose, and it avoids reading or printing secret files.

## Run Setup

\`\`\`bash
node scripts/setup-codex-prompt-enhancer.mjs
\`\`\`

The setup is idempotent. It creates the CLI, templates, eval examples, a local Codex Skill, a concise \`AGENTS.md\` section, and a generated repo profile cache.

## Enhance a Prompt

\`\`\`bash
node tools/promptx/promptx.mjs "Add invoice CSV export"
\`\`\`

Optional direct Codex usage:

\`\`\`bash
codex "$(node tools/promptx/promptx.mjs 'Add invoice CSV export')"
\`\`\`

## Profile Commands

\`\`\`bash
node tools/promptx/promptx.mjs --profile
node tools/promptx/promptx.mjs --refresh-profile
\`\`\`

\`--profile\` prints the cached or generated repo profile. \`--refresh-profile\` regenerates \`.promptx/repo_profile.json\`.

## Skill Usage

The local skill lives at:

\`\`\`text
.agents/skills/prompt-enhancer/SKILL.md
\`\`\`

If \`.agents\` is mounted read-only, setup writes the same skill content to:

\`\`\`text
tools/promptx/skills/prompt-enhancer/SKILL.md
\`\`\`

Invoke it when you want Codex to enhance a rough task before implementation, for example: "Use the prompt-enhancer skill to turn this into a repo-aware prompt: Fix login redirect bug."

## Templates

Editable prompt templates live in:

\`\`\`text
tools/promptx/templates/
\`\`\`

The CLI currently builds prompts in code, but these templates are installed for future customization and evaluation.

## Safety Notes

- promptx ignores \`.env\`, private key, certificate, lock, build, dependency, and cache paths.
- It redacts common secret-looking values.
- It prefers file paths and metadata over source snippets.
- Do not paste real credentials into prompts.

## Examples

\`\`\`bash
node tools/promptx/promptx.mjs "Fix login redirect bug"
node tools/promptx/promptx.mjs "Refactor user service without changing behavior"
node tools/promptx/promptx.mjs "Audit webhook signature verification security"
\`\`\`
`;

const evalsReadme = `# promptx eval examples

These examples are manual checks for prompt quality. Use them when changing classification, file ranking, repo profiling, or output templates.

For each example:

1. Run the rough prompt through \`node tools/promptx/promptx.mjs\`.
2. Compare the output to the expected properties.
3. Note good signs, bad signs, and any repo-specific gaps.
`;

const created = [];
const existing = [];
const failures = [];

function record(relativePath, wasCreated) {
  (wasCreated ? created : existing).push(relativePath);
}

function recordWithFallback(relativePath, content, fallbackPath) {
  try {
    record(relativePath, writeIfMissing(relativePath, content));
  } catch (error) {
    failures.push(relativePath + ': ' + error.message);
    if (fallbackPath) {
      record(fallbackPath, writeIfMissing(fallbackPath, content));
    }
  }
}

record('tools/promptx/promptx.mjs', writeIfMissing('tools/promptx/promptx.mjs', existingOrFallbackCliSource()));
record('tools/promptx/templates/base.md', writeIfMissing('tools/promptx/templates/base.md', baseTemplate));
for (const [name, content] of Object.entries(taskTemplates)) {
  record('tools/promptx/templates/' + name, writeIfMissing('tools/promptx/templates/' + name, content));
}
recordWithFallback('.agents/skills/prompt-enhancer/SKILL.md', skill, 'tools/promptx/skills/prompt-enhancer/SKILL.md');
record('tools/promptx/README.md', writeIfMissing('tools/promptx/README.md', readme));
record('tools/promptx/evals/README.md', writeIfMissing('tools/promptx/evals/README.md', evalsReadme));
for (const [name, content] of Object.entries(evals)) {
  record('tools/promptx/evals/' + name, writeIfMissing('tools/promptx/evals/' + name, content));
}

const agentsStatus = upsertManagedSection('AGENTS.md', '<!-- promptx:start -->', '<!-- promptx:end -->', agentsSection);
const gitignoreUpdated = ensureGitignoreEntry('.promptx/repo_profile.json');
const packageStatus = maybeAddPackageScripts();

let profileStatus = 'not generated';
try {
  execFileSync(process.execPath, [path.join(repo.root, 'tools/promptx/promptx.mjs'), '--refresh-profile'], {
    cwd: repo.root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  profileStatus = 'generated';
} catch (error) {
  profileStatus = 'failed: ' + (error.stderr ? String(error.stderr).trim() : error.message);
}

console.log([
  'promptx setup complete',
  '',
  'Created:',
  created.length ? created.map((file) => '- ' + file).join('\n') : '- none',
  '',
  'Already existed:',
  existing.length ? existing.map((file) => '- ' + file).join('\n') : '- none',
  '',
  'Could not create:',
  failures.length ? failures.map((file) => '- ' + file).join('\n') : '- none',
  '',
  'AGENTS.md: ' + agentsStatus,
  '.gitignore: ' + (gitignoreUpdated ? 'updated' : 'unchanged'),
  'package.json scripts: ' + packageStatus,
  'repo profile: ' + profileStatus,
].join('\n'));
