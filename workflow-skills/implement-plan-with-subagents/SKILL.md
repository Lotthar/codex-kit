---
name: implement-plan-with-subagents
description: Use when implementing an approved plan, PLANS.md, implementation checklist, issue plan, or output from the plan-with-subagents skill. Coordinates subagents to implement code cleanly, update tests/docs, validate, and review the diff.
---

# Implement plan with subagents

Use this skill when the user asks to implement an already-approved plan or execute a plan created by `plan-with-subagents`.

This skill is for **actual implementation**, not initial planning. Planning should already exist in the current thread, `PLANS.md`, an issue, a task file, a design doc, or a referenced previous Codex result.

## Ponytail Integration

Treat the approved plan as an explicit requirement. Use Ponytail to choose the least complex compliant implementation, reuse existing code, and avoid unnecessary dependencies or abstractions; never use it to silently skip an approved step or acceptance criterion. This skill's required validation and final report override Ponytail's minimum-check and terse-output defaults.

## Model and agent strategy

- The parent/main thread should act as the final coordinator and synthesizer.
- Let Codex choose available models by default so the workflow remains portable across accounts and releases.
- Use faster, lower-cost agents for mapping, focused tests, documentation impact checks, summaries, and mechanical slices.
- Reserve the strongest available reasoning for unclear architecture, security-sensitive decisions, difficult debugging, and final synthesis.
- The parent thread owns final decisions and final integration.

## Non-negotiable implementation rules

Follow these rules for every implementation:

1. Follow all applicable `AGENTS.md` files.
2. Discover and use relevant project-local skills when present.
3. Prefer project-specific skills and instructions over this generic global skill when they are more specific.
4. Implement the approved plan only.
5. Do not expand scope without explicit user approval.
6. Keep changes small, cohesive, and reviewable.
7. Follow existing code style, architecture, naming, error handling, logging, and testing patterns.
8. Avoid unrelated refactors and drive-by formatting.
9. Do not add dependencies unless the plan explicitly requires them or the user approves them.
10. Do not silence errors, loosen validation, skip tests, delete tests, or hide failures to make the work appear complete.
11. Add or update tests when behavior changes.
12. Run the most relevant validation available.
13. Review the diff before reporting completion.
14. Be honest about commands that failed, timed out, or could not be run.

## Clean-code standards

Implementation should satisfy these standards:

- Clear names for functions, classes, variables, files, and tests.
- Small functions and cohesive modules.
- Minimal duplication.
- Explicit data flow and limited hidden side effects.
- Type safety where the project uses types.
- Boundary validation where inputs cross trust or API boundaries.
- Errors handled intentionally, not swallowed.
- Existing public behavior preserved unless the plan explicitly changes it.
- Tests express behavior rather than implementation details when practical.
- Comments explain non-obvious decisions, not obvious code.

## Required context intake

Before editing code:

1. Identify the approved plan.
   - Look in the current request.
   - Look for `PLANS.md`, implementation checklists, issue descriptions, or previous planning output if referenced.
   - If no plan exists, stop and say that implementation requires an approved plan. Suggest using `$plan-with-subagents` first.
2. Read all applicable `AGENTS.md` guidance.
3. Inspect repository structure and relevant manifests.
4. Identify relevant project-local skills in `.agents/skills` or other configured skill locations.
5. State which project instructions and skills will guide the implementation.

## Subagent workflow

For non-trivial implementation, spawn only the read-only subagents whose questions are independent and useful:

- `implement_code_mapper`
- `implement_plan_guard`
- `implement_task_slicer`

For plans that change public behavior, APIs, configuration, user flows, or docs, also spawn:

- `implement_docs_scout`

When Codex Kit model routing is installed, prefer `codex_kit_mapper` for mapping, `codex_kit_support` for plan guards and documentation checks, `codex_kit_worker` for non-overlapping implementation/test slices, and `codex_kit_reviewer` for validation and final diff review. If a Kit role is unavailable, use the named role above or an ordinary bounded subagent with the same responsibility.

Wait for the read-only subagents to finish. Synthesize their results before writing code.

For trivial and small targeted plans, implement directly when delegation would cost more than the change. Use one delegation level only: subagents must not spawn children or create a second task tree.

Then implement in slices:

- The parent may implement small slices directly.
- Use `implement_worker` for bounded code slices.
- Use `implement_test_writer` for focused tests.
- Do not let multiple writer agents edit overlapping files concurrently.
- Use serial execution when slices touch the same files, shared interfaces, migrations, lockfiles, or central abstractions.
- If parallel writer agents are used, assign non-overlapping file sets and integrate their results in the parent thread.
- Give each writer an explicit file allowlist. The parent owns shared files, integration, and conflict resolution.

After implementation, spawn review/validation subagents:

- `implement_validation_runner`
- `implement_clean_code_reviewer`

Run another focused implementation pass if review or validation finds real issues.

## Implementation sequence

Follow this sequence:

### 1. Confirm plan and scope

Produce a short implementation scope summary:

- Plan source:
- Acceptance criteria:
- Explicitly out of scope:
- Project instructions/skills to follow:

If the plan is ambiguous but not blocked, make the smallest reasonable assumption and state it. If the ambiguity could cause destructive or incompatible changes, stop and ask for approval.

### 2. Map and slice

Use subagents to map the codebase and slice work.

The parent must synthesize:

- Files to change.
- Ordered implementation slices.
- Which slices require tests.
- Which slices require docs.
- Which validation commands are likely relevant.

### 3. Implement incrementally

For each slice:

- Make the smallest cohesive change.
- Keep the diff reviewable.
- Preserve existing behavior outside the planned change.
- Add or update tests near the changed behavior.
- Run focused validation when practical before moving to the next slice.

### 4. Validate

Use available project commands from `AGENTS.md`, README files, package manifests, Makefiles, CI config, or existing scripts.

Prefer this order:

1. Focused test for changed behavior.
2. Relevant unit/integration tests.
3. Type check.
4. Lint/format check.
5. Build or full test suite when practical.

Do not claim that validation passed unless it actually passed.

### 5. Review the diff

Use `implement_clean_code_reviewer` to review the final diff.

The parent must address blocking findings or explicitly report why they were not addressed.

Review for:

- Correctness.
- Plan alignment.
- Clean code.
- Test coverage.
- Security-sensitive issues.
- Backwards compatibility.
- Unwanted scope creep.
- Project instruction/skill compliance.

### 6. Final response

The final response must include:

## Implementation complete
- Summary:
- Plan source:
- Files changed:

## Tests and validation
- Commands run:
- Results:
- Commands not run:

## Subagents used
- Agent:
  - Contribution:

## Review notes
- Clean-code review result:
- Remaining risks:
- Deviations from plan:

## Next steps
- Only include necessary follow-up, if any.

## Stop conditions

Stop and ask for approval before proceeding if:

- The plan requires a destructive migration or data deletion.
- The plan requires new paid services, new production dependencies, or credentials.
- The plan conflicts with `AGENTS.md` or project-local skills.
- The implementation would require broad refactoring not included in the plan.
- Tests reveal an unrelated large failure that makes validation impossible to interpret.

Otherwise, proceed with the implementation using the smallest safe interpretation of the approved plan.
