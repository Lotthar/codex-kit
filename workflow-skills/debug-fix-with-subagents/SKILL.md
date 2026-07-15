---
name: debug-fix-with-subagents
description: Use for debugging, bug fixing, failing tests, regressions, crashes, exceptions, flaky behavior, CI failures, incorrect behavior, and production issue diagnosis. Uses focused subagents for parallel evidence gathering and returns results to the main agent for final synthesis and patching.
---

# Debug and fix with subagents

Use this skill when the user asks to debug, diagnose, reproduce, investigate, fix, repair, stabilize, or validate a bug, regression, failing test, crash, exception, flaky behavior, CI failure, incorrect behavior, or production issue.

## Ponytail Integration

Rely on Ponytail for the root-cause-first, smallest-correct-patch decision after evidence establishes the real flow and affected callers. This skill owns reproduction, parallel evidence gathering, risk escalation, regression coverage, and validation. Security, data-loss, compatibility, and project test requirements override Ponytail's minimum-check floor.

## Model orchestration

Let Codex choose available models by default. Prefer faster, lower-cost agents for triage, reproduction, log analysis, test design, and bounded code mapping. Reserve the strongest available reasoning for disputed root causes, security or data-loss risk, fix selection, and final synthesis. Do not make completion depend on a model name that may be unavailable to the current account.

## Core rule

Subagents gather evidence and produce structured results. The parent/main thread owns final judgment, code edits, validation decisions, and the final user-facing report.

## Default workflow

### Phase 1 — Intake

Identify:

- The reported symptom.
- Expected behavior.
- Actual behavior.
- Reproduction steps, if supplied.
- Relevant failing tests, stack traces, logs, CI output, or screenshots.
- The suspected area of the codebase, if any.

Do not ask clarifying questions unless the task is impossible to start. Make a best effort using the available repository and evidence.

### Phase 2 — Parallel investigation

For non-trivial bugs, spawn subagents in parallel and wait for their results before deciding the fix.

Skip delegation for a trivial, already-reproduced issue with one obvious local cause. Use one delegation level only: subagents must not spawn children, edit files, or create a competing investigation tree.

Use this default delegation:

- Spawn `debug_triage` to map symptoms, relevant files, and initial hypotheses.
- Spawn `failure_log_analyzer` when logs, stack traces, CI output, or test output are present.
- Spawn `repro_runner` when the bug can plausibly be reproduced by tests, scripts, CLI commands, or local app commands.
- Spawn `root_cause_scout` after initial context is available to evaluate causal hypotheses.

Optional delegation:

- Spawn `fix_candidate_designer` when there are multiple plausible fix shapes.
- Spawn `regression_test_designer` before editing or immediately after choosing a fix strategy.
- Spawn `patch_reviewer` after the patch and targeted validation are complete.

Each subagent must receive a bounded evidence question and return concise structured findings. Do not paste raw full logs into the main thread unless they are short and decisive.

### Phase 3 — Parent synthesis

After subagents return, synthesize:

- Root cause.
- Confidence level.
- Minimal fix strategy.
- Files to edit.
- Regression test strategy.
- Validation commands.
- Risks and rollback notes.

If subagents disagree, compare evidence and explicitly choose the better-supported explanation.

### Phase 4 — Patch

The parent/main thread should make the smallest safe fix.

Rules:

- Fix the cause, not just the symptom.
- Avoid broad rewrites.
- Avoid unrelated formatting or refactors.
- Avoid deleting, weakening, or skipping tests.
- Avoid swallowing exceptions or hiding errors unless that is truly the intended product behavior.
- Avoid changing public behavior without noting compatibility impact.
- Prefer an added or updated regression test when practical.
- Preserve existing style and conventions.

### Phase 5 — Validation

Run validation in this order when available:

1. The narrow failing test or reproduction command.
2. The new or updated regression test.
3. The closest related test file or package.
4. Lint/typecheck if relevant to the changed files.
5. Broader suite only when it is affordable and useful.

If validation cannot run, state exactly why and what command the user should run.

### Phase 6 — Patch review

For non-trivial patches, spawn `patch_reviewer` after implementation and validation. Ask it to review the diff for correctness, incomplete fixes, missing tests, regressions, and unrelated changes.

The parent/main thread decides whether to make follow-up edits based on the review.

## Output format

Use this final structure:

```markdown
## Summary
- Root cause:
- Fix made:
- Confidence: low | medium | high

## Evidence
- Reproduction:
- Key files/symbols:
- Decisive observation:

## Changes
- File:
  - Change:
  - Why:

## Validation
- Command:
  - Result:
- Command not run:
  - Reason:

## Tests
- Added/updated:
- Coverage rationale:

## Risks and follow-up
- Risk:
- Follow-up:
```

## Escalation rules

Escalate to more careful parent reasoning before editing when:

- The bug affects security, auth, billing, permissions, data loss, migrations, concurrency, cryptography, or production incident response.
- The root cause is uncertain after reproduction.
- The patch would change public APIs or persisted data.
- Tests conflict with the apparent intended behavior.
- The fix requires dependency upgrades, lockfile changes, or environment changes.

## Things not to do

Never do these as shortcuts:

- Do not skip, delete, or weaken tests just to make CI pass.
- Do not add arbitrary sleeps for flaky tests unless timing is proven to be the contract.
- Do not catch and ignore broad exceptions.
- Do not replace specific assertions with broad snapshots unless that improves the test meaningfully.
- Do not make large refactors in the same patch unless required for the bug fix.
- Do not change dependencies without explaining why.
- Do not claim the bug is fixed unless validation supports it or you clearly state validation was not possible.
