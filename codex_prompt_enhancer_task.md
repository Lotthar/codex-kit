# Codex Task: Create a Repo-Aware Prompt Enhancer Bootstrap System

## Task

Create a reusable, repo-aware Codex prompt-enhancer bootstrap system for this repository.

The goal is to let me run one setup script in any project, and have it install a local prompt-enhancement workflow that turns rough development requests into highly structured, repo-aware Codex prompts.

Codex supports durable repo guidance through `AGENTS.md`, reusable workflows through Skills, and local CLI execution from the selected directory, so this implementation should use those patterns where appropriate.

---

## High-level goal

Implement a general-purpose setup script that I can run once per project.

After running the setup script, the repository should contain:

1. A repo-aware prompt enhancer CLI.
2. A Codex Skill for prompt enhancement.
3. A concise `AGENTS.md` starter or update.
4. A cached repo profile generator.
5. Safe secret-redaction behavior.
6. Prompt templates for different task types.
7. Basic eval examples for improving prompt quality over time.
8. Clear documentation explaining usage.

The enhancer should take a rough prompt like:

```text
Add invoice CSV export
```

And produce a structured Codex-ready prompt with:

- Task
- Goal
- Repo context
- Relevant files to inspect first
- Existing patterns to follow
- Constraints
- Suggested approach
- Verification commands
- Done criteria
- Output expectations

---

## Implementation requirements

### 1. Create a bootstrap script

Create this file:

```text
scripts/setup-codex-prompt-enhancer.mjs
```

It must be:

- Idempotent.
- Safe to run multiple times.
- Written in plain Node.js using only built-in modules.
- Compatible with modern Node.js.
- Able to run from the repository root with:

```bash
node scripts/setup-codex-prompt-enhancer.mjs
```

The script should detect whether it is being run inside a git repository. If not, it should continue but warn that file discovery will be less accurate.

The setup script should create the files and directories described below.

Do not install dependencies unless absolutely necessary. Prefer zero dependencies.

Do not overwrite existing important user files without preserving the old content or using clearly marked sections.

---

### 2. Create the prompt enhancer CLI

Create:

```text
tools/promptx/promptx.mjs
```

This should be a standalone CLI that can be run as:

```bash
node tools/promptx/promptx.mjs "Add invoice CSV export"
```

It should output an enhanced Codex prompt to stdout.

Also support:

```bash
node tools/promptx/promptx.mjs --profile
node tools/promptx/promptx.mjs --refresh-profile
node tools/promptx/promptx.mjs --help
```

#### CLI behavior

The CLI should:

1. Read the rough user prompt from command-line arguments.
2. Detect repo metadata.
3. Classify the task.
4. Find relevant files.
5. Choose likely verification commands.
6. Generate a high-quality Codex prompt.
7. Print the enhanced prompt.

#### Task classifier

Implement a simple classifier with these task types:

```text
feature
bugfix
refactor
test
docs
migration
debugging
code-review
performance
security
```

Use keyword-based classification first. Keep it simple but extensible.

Examples:

- `fix`, `bug`, `error`, `crash`, `broken` → `bugfix`
- `add`, `create`, `implement`, `support` → `feature`
- `refactor`, `cleanup`, `simplify`, `restructure` → `refactor`
- `test`, `coverage`, `spec` → `test`
- `docs`, `readme`, `documentation` → `docs`
- `migration`, `schema`, `database` → `migration`
- `debug`, `investigate`, `why` → `debugging`
- `review`, `audit`, `inspect` → `code-review`
- `slow`, `performance`, `optimize`, `latency` → `performance`
- `security`, `vulnerability`, `auth`, `permission`, `injection`, `xss`, `csrf` → `security`

#### Repo profile detection

The CLI should inspect common project files if they exist:

```text
package.json
pnpm-workspace.yaml
yarn.lock
package-lock.json
bun.lockb
turbo.json
nx.json
tsconfig.json
vite.config.*
next.config.*
go.mod
Cargo.toml
pyproject.toml
requirements.txt
Pipfile
poetry.lock
Gemfile
composer.json
README.md
CONTRIBUTING.md
AGENTS.md
docs/**
```

It should infer:

```json
{
  "packageManager": "pnpm | npm | yarn | bun | unknown",
  "languages": [],
  "frameworks": [],
  "commands": {},
  "docs": [],
  "importantPaths": {},
  "testFiles": [],
  "sourceFiles": []
}
```

Use best-effort detection only. Do not invent facts.

#### File discovery

Use `git ls-files` when available.

Fallback to recursive directory walking.

Ignore:

```text
node_modules
.git
dist
build
.next
.nuxt
coverage
.turbo
.cache
vendor
target
out
tmp
.env
.env.*
*.pem
*.key
```

#### Relevant file ranking

Rank files based on:

- Terms from the user prompt.
- Matching path segments.
- Matching filenames.
- Nearby tests.
- Docs mentioning relevant domain terms.
- Common source directories like `src`, `app`, `apps`, `packages`, `services`.

Do not include generated files, lockfiles, secrets, or build artifacts as relevant files.

Return around 10–20 relevant files.

#### Secret redaction

Implement a redaction utility.

Never print values from:

```text
.env
.env.local
.env.development
.env.production
*.pem
*.key
```

Redact suspicious values matching common secret patterns:

```text
OPENAI_API_KEY
STRIPE_SECRET_KEY
DATABASE_URL
AWS_SECRET_ACCESS_KEY
GITHUB_TOKEN
PRIVATE_KEY
JWT_SECRET
TOKEN
PASSWORD
SECRET
```

If the CLI ever includes file snippets in the future, it must pass them through the redactor first.

For now, prefer file paths and metadata over code snippets.

---

## Prompt output format

The enhanced prompt must use this exact structure:

```md
# Task

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

1. Read `AGENTS.md` and relevant docs first.
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
```

---

## Task-type-specific prompt enhancements

Add extra sections based on task type.

### Feature

Include:

```md
# Expected behavior

# API/UI/data contract considerations

# Tests to add or update
```

### Bugfix

Include:

```md
# Reproduction guidance

# Expected vs actual behavior

# Regression test expectations
```

### Refactor

Include:

```md
# Refactor invariants

# Compatibility constraints

# Behavior that must not change
```

### Test

Include:

```md
# Coverage target

# Test cases to consider

# Existing test patterns
```

### Docs

Include:

```md
# Documentation scope

# Existing docs to update

# Accuracy checks
```

### Migration

Include:

```md
# Migration safety

# Backward compatibility

# Rollback considerations
```

### Debugging

Include:

```md
# Investigation plan

# Evidence to collect

# Hypotheses to verify
```

### Code review

Include:

```md
# Review focus

# Risk areas

# Review output format
```

### Performance

Include:

```md
# Performance hypothesis

# Measurement plan

# Avoided tradeoffs
```

### Security

Include:

```md
# Security constraints

# Threat model

# Sensitive data handling

# Abuse cases to test
```

---

## 3. Create prompt templates

Create:

```text
tools/promptx/templates/base.md
tools/promptx/templates/feature.md
tools/promptx/templates/bugfix.md
tools/promptx/templates/refactor.md
tools/promptx/templates/test.md
tools/promptx/templates/docs.md
tools/promptx/templates/migration.md
tools/promptx/templates/debugging.md
tools/promptx/templates/code-review.md
tools/promptx/templates/performance.md
tools/promptx/templates/security.md
```

The CLI may either read these templates or keep the template logic inline, but the files should exist so I can edit them later.

Each template should be concise and practical.

---

## 4. Create or update `AGENTS.md`

If `AGENTS.md` does not exist, create it.

If it exists, append a clearly marked section:

```md
<!-- promptx:start -->
...
<!-- promptx:end -->
```

Do not duplicate the section on repeated runs.

The section should instruct Codex to:

- Prefer repo-aware prompts.
- Read relevant files before editing.
- Follow existing architecture and naming.
- Use the project’s package manager.
- Run targeted tests when possible.
- Avoid unrelated refactors.
- Never expose secrets.
- Summarize changed files and verification results.

Keep `AGENTS.md` concise because Codex project guidance should stay practical and not become an oversized rules dump.

---

## 5. Create a Codex Skill

Create:

```text
.agents/skills/prompt-enhancer/SKILL.md
```

The Skill should say:

```md
---
name: prompt-enhancer
description: Use when the user gives a rough coding task and wants it converted into a repo-aware Codex prompt before implementation.
---

You are a repo-aware Codex prompt enhancer.

When invoked:

1. Read active `AGENTS.md` guidance.
2. Inspect README, package config, workspace config, and relevant docs.
3. Infer the stack, package manager, test commands, and repo layout.
4. Classify the task as feature, bugfix, refactor, test, docs, migration, debugging, code-review, performance, or security.
5. Use file search to identify likely relevant files.
6. Produce an enhanced Codex prompt.

Rules:

- Do not invent repo facts.
- Do not include secrets or `.env` values.
- Keep the final prompt focused.
- Prefer file paths and verification commands over broad descriptions.
- Include assumptions only when clearly marked.
- Ask for clarification only when the task is genuinely blocked.
- Otherwise, produce a best-effort enhanced prompt.
```

---

## 6. Create eval examples

Create:

```text
tools/promptx/evals/001-feature-invoice-export.md
tools/promptx/evals/002-bugfix-login-redirect.md
tools/promptx/evals/003-refactor-user-service.md
tools/promptx/evals/004-security-webhook-signature.md
tools/promptx/evals/README.md
```

Each eval should include:

```md
# Rough prompt

# Expected enhanced prompt properties

# Good signs

# Bad signs
```

These evals are not automated initially. They are examples I can use to improve the enhancer.

---

## 7. Create documentation

Create:

```text
tools/promptx/README.md
```

Include:

- What this tool does.
- How to run setup.
- How to enhance a prompt.
- How to use it with Codex.
- How to invoke the Skill.
- How to refresh the repo profile.
- How to customize templates.
- Safety notes about secrets.
- Examples.

Example usage:

```bash
node tools/promptx/promptx.mjs "Add invoice CSV export"
```

Optional usage:

```bash
codex "$(node tools/promptx/promptx.mjs 'Add invoice CSV export')"
```

Also include:

```bash
node tools/promptx/promptx.mjs --profile
node tools/promptx/promptx.mjs --refresh-profile
```

---

## 8. Optional package.json integration

If `package.json` exists, add scripts only if this can be done safely without disrupting formatting too much.

Add:

```json
{
  "scripts": {
    "promptx": "node tools/promptx/promptx.mjs",
    "promptx:profile": "node tools/promptx/promptx.mjs --profile",
    "promptx:refresh": "node tools/promptx/promptx.mjs --refresh-profile"
  }
}
```

If package.json modification is risky, skip it and document the manual commands instead.

---

## 9. Repo profile cache

Create a generated cache file at:

```text
.promptx/repo_profile.json
```

The setup script should add this path to `.gitignore` unless the repo already intentionally tracks `.promptx`.

The CLI should regenerate this file when:

```bash
node tools/promptx/promptx.mjs --refresh-profile
```

The profile should include:

```json
{
  "generatedAt": "...",
  "root": "...",
  "packageManager": "...",
  "languages": [],
  "frameworks": [],
  "commands": {},
  "docs": [],
  "sourceFiles": [],
  "testFiles": [],
  "importantPaths": {},
  "notes": []
}
```

---

## 10. Verification

After implementation, run:

```bash
node scripts/setup-codex-prompt-enhancer.mjs
node tools/promptx/promptx.mjs --help
node tools/promptx/promptx.mjs --profile
node tools/promptx/promptx.mjs --refresh-profile
node tools/promptx/promptx.mjs "Add invoice CSV export"
node tools/promptx/promptx.mjs "Fix login redirect bug"
node tools/promptx/promptx.mjs "Refactor user service without changing behavior"
node tools/promptx/promptx.mjs "Audit webhook signature verification security"
```

If this repo has lint/test/typecheck commands, run the relevant ones too.

---

## Acceptance criteria

The task is complete when:

- `scripts/setup-codex-prompt-enhancer.mjs` exists and is idempotent.
- `tools/promptx/promptx.mjs` exists and can enhance rough prompts.
- The CLI works without third-party dependencies.
- `AGENTS.md` is created or safely updated.
- `.agents/skills/prompt-enhancer/SKILL.md` exists.
- Prompt templates exist.
- Eval examples exist.
- Documentation exists.
- `.promptx/repo_profile.json` can be generated.
- Secret-looking values are not printed.
- Re-running setup does not duplicate managed sections.
- Final response includes changed files and verification command results.

---

## Implementation style

Use clean, readable JavaScript.

Prefer small functions:

- `findRepoRoot`
- `detectPackageManager`
- `readPackageJson`
- `discoverFiles`
- `detectLanguages`
- `detectFrameworks`
- `detectCommands`
- `classifyTask`
- `rankRelevantFiles`
- `buildEnhancedPrompt`
- `redactSecrets`
- `writeIfMissing`
- `upsertManagedSection`
- `ensureGitignoreEntry`

Include helpful error messages.

Avoid overengineering. Do not add embeddings, databases, or external services in the first version.

---

## Important constraints

- Do not read or print `.env` contents.
- Do not include secrets in generated prompts.
- Do not add external dependencies.
- Do not overwrite existing user content.
- Do not make unrelated repo changes.
- Do not implement the actual feature from any eval prompt; only create the prompt enhancer system.

---

## Final response format

When finished, respond with:

````md
## Implemented

- ...

## Files changed

- ...

## Verification

- `command` — result

## Usage

```bash
node scripts/setup-codex-prompt-enhancer.mjs
node tools/promptx/promptx.mjs "Your rough task here"
```

## Notes

- ...
````
