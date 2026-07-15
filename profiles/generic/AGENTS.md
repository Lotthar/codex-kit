# Generic project profile

This profile supplies rules shared by every Codex Kit project. Runtime and framework profiles add deltas; they do not replace these rules.

## Instruction precedence

- Follow system and user instructions first.
- Follow the repository root `AGENTS.md`, then the nearest path-specific `AGENTS.md`.
- Treat existing code, tests, build scripts, and CI as evidence of local conventions.
- Prefer an explicit approved plan over generic preferences.
- Preserve public behavior unless the task explicitly changes it.
- Keep edits inside the requested scope and protect unrelated user changes.

## Start with focused discovery

- Check Git status before editing.
- Read the smallest relevant manifest, documentation, and configuration files.
- Find exact symbols, callers, imports, routes, and related tests before broad searches.
- Use repository scripts and wrappers instead of inventing commands.
- Identify generated, vendored, migration, fixture, and lock files before touching them.
- Record pre-existing failures separately from failures caused by the change.
- Do not load an entire repository when a focused map is enough.

Build a compact context packet for non-trivial work:

```text
Task:
Relevant architecture:
Likely files to edit:
Related tests:
Commands to run:
Risky areas:
Do not edit:
```

## Choose the workflow

- Answer and review requests are read-only unless the user also asks for changes.
- Diagnose requests should establish the cause before implementation.
- Small targeted changes should be implemented directly.
- Non-trivial implementation should be planned before multiple shared boundaries are changed.
- Bug fixes should add a regression check when the behavior can be reproduced deterministically.
- Refactors should preserve behavior and remain separate from feature work unless explicitly combined.
- Migrations, auth, permissions, billing, and production operations are high risk.

## Architecture and boundaries

- Preserve the repository's established dependency direction.
- Keep domain decisions separate from transport, persistence, UI, and framework glue where the project already supports that separation.
- Validate data where it crosses a trust, process, API, storage, or user-input boundary.
- Keep side effects explicit and close to adapters or entry points.
- Prefer cohesive modules over generic utility collections.
- Reuse an existing abstraction only when its semantics match the new use.
- Avoid adding an interface, service, factory, wrapper, or configuration switch for one speculative use.
- Do not move code merely to satisfy an abstract architecture diagram.
- Preserve stable public contracts unless the requested change includes a migration path.

## Clean-code defaults

- Use the Ponytail skill when available to choose the smallest correct implementation.
- Prefer standard-library, platform, and already-installed capabilities.
- Use clear domain names and direct control flow.
- Keep functions and modules cohesive; split only at a real responsibility boundary.
- Remove duplication only when the shared concept is stable and obvious.
- Comments should explain constraints, intent, or non-obvious tradeoffs.
- Do not hide failures with broad catches, silent defaults, or weakened assertions.
- Do not perform drive-by formatting or unrelated cleanup.
- Leave touched code no harder to understand than before.

## Dependencies and generated artifacts

- Do not add or upgrade dependencies unless required by the task and approved by repository policy.
- Use the detected package/build tool and committed lock state.
- Review transitive, license, runtime, and supply-chain impact for dependency changes.
- Never hand-edit generated output when a source file or generator owns it.
- Run generators only when their inputs intentionally changed.
- Keep generated diffs scoped and reproducible.

## Security and data safety

- Never print, copy, commit, or persist credentials or secret values.
- Read environment examples and variable names, not private environment contents.
- Use parameterized queries and framework-native escaping and validation.
- Enforce authorization at the trusted server or domain boundary, not only in a client.
- Treat file paths, URLs, redirects, uploads, deserialization, and shell arguments as untrusted input.
- Do not weaken TLS, CORS, CSRF, authentication, or permission checks to make a test pass.
- Use local/test data stores; never mutate production or shared remote data without explicit authority.
- Ask before destructive commands, migrations, deployments, or broad filesystem changes.

## Skill routing

- Use `ponytail` for implementation shape and dependency restraint when available.
- Use `targeted-codebase-work` for focused changes in an existing repository.
- Use `plan-with-subagents` when the user requests a plan or the work is architectural, risky, or cross-cutting.
- Use `implement-plan-with-subagents` when an approved plan already exists.
- Use `debug-fix-with-subagents` for non-trivial regressions, crashes, flaky behavior, or failing tests.
- Use `continuous-clean-code-refactor` only for requested cleanup or maintainability work.
- Use `qa-e2e-sweep` for evidence-gathering QA; do not silently turn QA into implementation.
- Use `playwright-e2e-setup` to create, repair, or modernize project-scoped Playwright infrastructure.
- Prefer a more specific framework or domain skill when one is available.
- If a named skill is unavailable, continue with repository guidance and report the fallback once.

## Conditional subagent delegation

- Do not delegate trivial fixes, single-file mechanical edits, or ordinary command runs.
- For medium work, delegate one bounded read-only mapping or test-discovery task when it reduces uncertainty.
- For large or risky work, use one level of focused subagents for mapping, plan checking, implementation slices, tests, and review.
- Never create recursive subagent trees.
- Give every subagent a concrete question, file boundary, and concise output format.
- Keep writer file sets non-overlapping; serialize work on shared manifests, schemas, migrations, and central interfaces.
- Wait for relevant subagents, then let the main agent synthesize decisions and own the final patch.
- Ruflo may track durable state for three or more dependent workstreams; Codex agents still perform the work.
- Never store secrets, private source content, or raw sensitive logs in orchestration memory.

## Testing strategy

- Start with the narrowest test that exercises the changed behavior.
- Add or update tests when behavior changes.
- Prefer behavior assertions over private implementation details.
- Cover success, relevant failure, boundary, and permission paths.
- Keep tests deterministic; avoid arbitrary sleeps and uncontrolled network dependencies.
- Use existing fixtures and test helpers before creating new frameworks.
- Run broader integration or end-to-end checks when the touched boundary justifies them.
- Preserve useful failure output and distinguish environmental blockers from product failures.

## Validation order

Use commands discovered from repository docs, manifests, and CI in this order when applicable:

1. Focused test for the touched behavior.
2. Relevant unit or component test group.
3. Type or static analysis.
4. Lint and formatting checks.
5. Integration or end-to-end checks.
6. Build or full test suite when risk warrants it.

Do not claim a check passed unless it actually ran successfully.

## Review before handoff

- Inspect the final diff for accidental edits, generated noise, secrets, and scope creep.
- Confirm new failure paths return useful errors without exposing sensitive data.
- Confirm tests fail for the intended reason before the fix when practical.
- Ensure documentation and examples match changed public behavior or configuration.
- Report commands run, results, commands not run, and remaining risks.
- Do not commit, push, deploy, or create external issues unless requested.

## Definition of done

- The requested behavior is implemented or the requested analysis is complete.
- Applicable acceptance criteria are demonstrably satisfied.
- Relevant tests and quality gates pass, or blockers are reported precisely.
- Existing user work and unrelated behavior remain intact.
- The diff is cohesive, reviewable, and free of avoidable complexity.
- Any follow-up is necessary rather than speculative.

## Reference anchors

- OWASP secure development practices: https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/
- Git documentation: https://git-scm.com/docs
