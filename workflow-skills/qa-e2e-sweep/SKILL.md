---
name: qa-e2e-sweep
description: Run evidence-based local QA for applications across UI, browser flows, APIs, databases, auth, permissions, integrations, accessibility, responsive states, and edge cases. Use when asked to QA, test, audit, verify, smoke-test, or perform an end-to-end sweep. Produce actionable findings; do not fix product code unless explicitly asked.
---

# QA E2E Sweep

Act as the QA coordinator. Test the actual local application where possible and distinguish observed evidence from inference. A complete sweep accounts for every deducible flow as tested, intentionally out of scope, or blocked with an exact prerequisite.

## Safety

- Use only local or isolated test services and data stores. Never use production, staging, or shared databases.
- Never print, copy, or commit credentials, tokens, private data, or `.env` values.
- Ask before dependency installation, network access, destructive database operations, container-volume deletion, or broad filesystem writes.
- Do not fix product code during a QA-only task.
- Do not create external issues unless the user explicitly asks.
- Prefer seeded data, reversible actions, and existing test infrastructure.

## Workflow

1. Read applicable `AGENTS.md`, project docs, manifests, lockfiles, CI, container config, environment examples, schemas, migrations, routes, workers, and existing tests.
2. Identify install, start, migrate, seed, test, and teardown commands. Prefer documented project commands; label inferred commands.
3. Write a compact QA strategy before broad execution: stack, services, roles, feature inventory, risk map, test matrix, evidence plan, blockers, and commands needing approval.
4. Read [test-matrix.md](references/test-matrix.md) and select only applicable dimensions. Do not mechanically run irrelevant cases.
5. Establish the narrowest safe runtime. Record branch, commit, environment, ports, fixtures, roles, and baseline failures.
6. Execute existing automated checks first, then targeted browser/API/database checks that materially expand coverage.
7. Capture concise evidence: commands, test names, routes, viewports, request shapes, safe result summaries, screenshots, traces, console errors, and artifact paths.
8. Dedupe findings and assign severity plus confidence. Read [report-format.md](references/report-format.md) before writing the report.
9. Store the report under `docs/qa/runs/` when repository policy permits; otherwise return the same structure in the final response.

## Conditional delegation

For a broad sweep with three or more independent surfaces, use one level of bounded subagents. Useful slices are stack/run discovery, UI/browser, API/backend, database integrity, auth/security-negative, and accessibility/visual review.

- Keep the main thread as coordinator and final reporter.
- Skip subagents for a focused smoke test or one narrow flow.
- Give each agent an explicit surface, environment, safety boundary, and evidence format.
- Subagents must not spawn children, edit product code, create issues, or use production systems.
- Use only one visual browser operator per app instance; parallelize read-only mapping, CLI tests, APIs, databases, and log analysis.
- Wait for all relevant evidence, then dedupe and normalize it in the parent.

When Codex Kit model routing is installed, use `codex_kit_mapper` for stack discovery, `codex_kit_support` for independent evidence slices, and `codex_kit_reviewer` to review the final finding set. Fall back to ordinary bounded roles when a Kit role is unavailable.

## Tool choice

- Prefer the repository's existing unit, integration, component, and E2E runners.
- Use Playwright or another installed browser runner for repeatable flows and artifacts.
- Use interactive browser control for exploratory verification, accessibility snapshots, console errors, and network failures.
- Use existing API clients, fixtures, ORM helpers, and test database tools before inventing scripts.
- If the app cannot run, continue with static discovery and a blocked test plan; never imply runtime coverage.

## Finding quality

Every finding must include a reproducible title, severity, confidence, affected area, environment, commit, preconditions, numbered steps, expected and actual results, evidence, likely files or symbols, suspected cause clearly marked as inference, fix direction, and a regression-test recommendation.

Severity:

- P0: security breach, data loss, unusable application, or fully blocked critical path.
- P1: broken core feature, authorization boundary, persistent corruption, auth, or checkout flow.
- P2: important defect with a workaround or non-critical API/data inconsistency.
- P3: minor visual, copy, polish, or rare low-risk issue.

Confidence is high for direct reproduction, medium for strong partial evidence, and low for static inference needing confirmation.

## Final handoff

Report coverage and gaps as carefully as findings. List commands actually run and their outcomes, commands not run with reasons, artifacts, blockers, and the exact safest next verification step. If the user later requests fixes, hand findings to the normal debugging or implementation workflow rather than silently changing task type.
