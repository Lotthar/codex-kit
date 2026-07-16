---
name: continuous-clean-code-refactor
description: Clean code refactor cleanup SOLID clean architecture readability maintainability technical debt workflow for existing repositories; performs behavior-preserving incremental repository cleanup with tests, repo-pattern detection, subagents for large work, and hooks-aware continuation.
---

# Continuous Clean Code Refactor

Use this skill to perform safe, behavior-preserving cleanup of existing repositories. Let the repository's own languages, frameworks, architecture, style, tests, and tooling decide what "clean" means.

## When to use

Use this skill implicitly whenever the user asks to:
- refactor code
- clean up a codebase
- improve readability
- apply clean code practices
- apply clean architecture
- reduce technical debt
- improve maintainability
- reorganize files/modules
- simplify conditionals
- use guard clauses
- remove unnecessary delegates/wrappers
- make files/classes/functions smaller
- improve SOLID boundaries
- prepare code for future development

Do not use this skill for:
- pure feature implementation unless the user also asks for cleanup
- broad rewrites that intentionally change behavior
- public API redesigns unless explicitly requested
- database/schema changes unless explicitly requested
- generated/vendor/build artifacts
- formatting-only churn across the entire repository unless formatting is already the repo standard

## Non-negotiable rule

Preserve behavior. All changes must be incremental, reversible, and verified by the repo's existing tests, type checks, linters, formatters, build commands, and smoke checks where available.

## Repository-first approach

Before refactoring:
1. Check git status and protect existing user changes.
2. Discover languages, frameworks, package managers, test frameworks, linters, formatters, build tools, CI config, and existing architecture.
3. Read existing AGENTS.md files and local conventions.
4. Identify the repo's current patterns before applying generic clean-code rules.
5. Prefer idiomatic patterns for the actual language/framework over dogmatic patterns.
6. Create or update `.codex/clean-code-refactor/state.json`.
7. Create or update `.codex/clean-code-refactor/repo-patterns.md`.
8. Create a cleanup inventory in `.codex/clean-code-refactor/cleanup-plan.md`.

Use `scripts/bootstrap_repo_clean_code.py` from the repo root to initialize state files and repo guidance. Then run `scripts/audit_repo_patterns.py` to generate starter pattern and cleanup-plan sections. Read `references/rubric.md` before ranking cleanup candidates and `references/refactor-playbook.md` before editing language/framework-specific code.

## Subagent behavior

For medium or large cleanup work, explicitly spawn focused subagents when the current Codex environment supports subagents.

Because Codex requires explicit subagent spawning, the active agent must ask for subagents as part of this workflow. Use subagents for:
- repo mapping and architecture boundaries
- test/lint/build command discovery
- language/framework-specific refactor opportunities
- risk review for behavior changes
- focused module cleanup plans
- final regression review

Use this wording inside the active task when applicable:
"Spawn focused subagents for repository mapping, quality gate discovery, architecture hotspot detection, language-specific cleanup opportunities, and regression-risk review. Wait for all subagents and consolidate their findings before editing."

Do not spawn subagents for tiny one-file cleanups.

## Cleanup principles

Apply these principles contextually:

### Readability
- Prefer clear names over comments explaining unclear code.
- Prefer direct control flow.
- Prefer guard clauses to deeply nested `if/else`.
- Reduce cognitive complexity before extracting abstractions.
- Remove dead code, unreachable branches, obsolete TODOs, and unused exports when safe.
- Keep comments that explain why, constraints, tradeoffs, or non-obvious domain rules.

### Structure
- Keep files focused on one responsibility.
- Split large files only along natural domain/framework boundaries.
- Keep functions small enough to understand without jumping across many files.
- Prefer cohesive modules over scattered utility dumping grounds.
- Preserve public APIs unless explicitly authorized.

### SOLID and architecture
- Apply SOLID only where it improves clarity and testability.
- Respect existing architecture boundaries.
- Keep dependency direction stable.
- Separate domain logic from I/O, framework glue, persistence, and transport layers when the repo architecture supports that.
- Avoid introducing unnecessary interfaces, abstract factories, managers, services, or generic layers.

### Conditionals
- Prefer guard clauses for validation and early exits.
- Replace complex nested conditionals with well-named predicates or strategy/polymorphism only when that is simpler.
- Do not replace simple conditionals with over-engineered abstractions.

### Delegates and wrappers
- Inline trivial private delegate methods when inlining improves readability.
- Do not inline methods that are public API, interface implementations, overrides, extension points, test seams, security/audit boundaries, instrumentation points, framework hooks, or domain language.
- Remove wrapper layers only when they add no naming, boundary, policy, logging, validation, dependency inversion, or test value.

### Duplication
- Remove duplication when the shared abstraction is obvious and stable.
- Do not create premature abstractions for coincidental duplication.
- Prefer small local duplication over confusing global indirection.

### Tests and safety
- Run the narrowest relevant tests after each batch.
- Run broader gates before declaring done.
- If tests fail before changes, record the baseline failure and avoid masking it.
- If tests fail after changes, revert or fix the batch before continuing.
- Never "fix" tests by weakening assertions unless the user explicitly requested behavior changes.

## Batch workflow

For each cleanup batch:
1. Pick a small, coherent area.
2. State the intended behavior-preserving refactor.
3. Make minimal changes.
4. Run formatter/linter/typecheck/tests relevant to the touched area.
5. Inspect diff for accidental behavior change.
6. Update `.codex/clean-code-refactor/state.json`.
7. Commit nothing unless the user asked.
8. Continue to the next batch only when the previous batch is verified.

## Stop criteria

Do not declare completion until:
- no high-confidence cleanup items remain in the plan
- all touched areas pass relevant checks
- final broad verification passes or pre-existing failures are clearly documented
- `.codex/clean-code-refactor/state.json` has `active: false`
- `.codex/clean-code-refactor/summary.md` explains what changed and why
- no generated/vendor files were modified accidentally
- the final diff is behavior-preserving and reviewable

## State file

Maintain `.codex/clean-code-refactor/state.json` during active cleanup with this shape:

```json
{
  "active": true,
  "mode": "continuous-clean-code-refactor",
  "repository_root": "",
  "started_at": "",
  "last_updated_at": "",
  "quality_gates": [],
  "completed_batches": [],
  "remaining_focus_areas": [],
  "blocked_items": [],
  "baseline_failures": [],
  "max_stop_continuations": 8,
  "stop_continuations_used": 0,
  "final_verification_passed": false
}
```

Set `active: false` only when stop criteria are satisfied.

## Repo pattern persistence

When the skill discovers project-specific conventions, update the nearest relevant `AGENTS.md` or `.codex/clean-code-refactor/repo-patterns.md` so future agents follow the repo's clean patterns.

For general future coding tasks, agents should:
- leave touched code cleaner than they found it
- follow repo-local naming, architecture, tests, and formatting
- avoid broad cleanup unless requested
- run relevant checks for touched code
- update repo guidance when repeated review feedback appears
