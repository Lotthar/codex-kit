---
name: plan-with-subagents
description: Use when planning a non-trivial implementation, refactor, migration, architecture change, risky bug fix, or multi-file code change before editing code.
---

# Plan With Subagents

Use this skill to plan a non-trivial code change before implementation.

## Ponytail Integration

Use Ponytail to minimize proposed scope and prefer existing, standard-library, or native-platform solutions. This skill owns evidence gathering, risk analysis, sequencing, and test planning. Do not let Ponytail silently remove explicit acceptance criteria; identify a simpler alternative in the plan and make any material scope tradeoff visible to the user.

## Delegation

For non-trivial work, spawn only the read-only planning subagents that can investigate independent questions:

- `planner_explorer`
- `risk_checker`
- `test_planner`
- `implementation_scout`

Skip delegation for trivial and small targeted changes when a direct plan is cheaper and equally reliable. Use one delegation level only: planning subagents must not spawn children.

## Rules

- Subagents are for planning only.
- Subagents must be read-only.
- Subagents must return concise structured results.
- Subagents must not edit files.
- Subagents must not make the final implementation decision.
- Give every subagent a bounded, non-overlapping question and an explicit output shape.
- Never create recursive subagent trees.
- Wait for all relevant subagents to finish.
- The parent/main thread must synthesize the final plan.
- Do not edit files until the user approves the final plan, unless the user explicitly asked for implementation immediately.

## Final synthesis format

Return the final parent-level plan in this format:

## Recommended approach

Explain the chosen approach and why it is better than the alternatives.

## Files likely to change

List files, directories, modules, or symbols likely to be modified.

## Step-by-step implementation plan

Provide ordered implementation steps.

## Risks and mitigations

Summarize risks discovered by the subagents and how to reduce them.

## Test and validation plan

List tests to add/update and commands to run.

## Open questions or assumptions

List only questions that materially affect the plan.

## What not to do

Call out tempting but risky approaches to avoid.
