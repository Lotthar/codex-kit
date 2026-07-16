<!-- codex-kit:project:start -->
## Codex Kit

This block is maintained by Codex Kit. Edit project-specific instructions outside it.

- Active profile: `generic`.
- Active profile: `node`.
- Project component: `base-policy`.
- Project component: `graphify`.
- Project component: `promptx`.
- Project component: `clean-code`.
- Project component: `obsidian-brain`.

- Follow human-authored repository instructions outside this managed block.
- Use Ponytail for coding simplicity when the global plugin is available.
- Use `$plan-with-subagents` for non-trivial planning and `$implement-plan-with-subagents` for approved plans.
- Use native Codex subagents for bounded current-task work; use Ruflo only for durable coordination across three or more dependent workstreams.
- Graphify installation, graph builds, and hooks require explicit project consent.


### generic

This profile supplies rules shared by every Codex Kit project. Runtime and framework profiles add deltas; they do not replace these rules.

#### Instruction precedence

- Follow system and user instructions first.
- Follow the repository root `AGENTS.md`, then the nearest path-specific `AGENTS.md`.
- Treat existing code, tests, build scripts, and CI as evidence of local conventions.
- Prefer an explicit approved plan over generic preferences.
- Preserve public behavior unless the task explicitly changes it.
- Keep edits inside the requested scope and protect unrelated user changes.

#### Start with focused discovery

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

#### Choose the workflow

- Answer and review requests are read-only unless the user also asks for changes.
- Diagnose requests should establish the cause before implementation.
- Small targeted changes should be implemented directly.
- Non-trivial implementation should be planned before multiple shared boundaries are changed.
- Bug fixes should add a regression check when the behavior can be reproduced deterministically.
- Refactors should preserve behavior and remain separate from feature work unless explicitly combined.
- Migrations, auth, permissions, billing, and production operations are high risk.

#### Architecture and boundaries

- Preserve the repository's established dependency direction.
- Keep domain decisions separate from transport, persistence, UI, and framework glue where the project already supports that separation.
- Validate data where it crosses a trust, process, API, storage, or user-input boundary.
- Keep side effects explicit and close to adapters or entry points.
- Prefer cohesive modules over generic utility collections.
- Reuse an existing abstraction only when its semantics match the new use.
- Avoid adding an interface, service, factory, wrapper, or configuration switch for one speculative use.
- Do not move code merely to satisfy an abstract architecture diagram.
- Preserve stable public contracts unless the requested change includes a migration path.

#### Clean-code defaults

- Use the Ponytail skill when available to choose the smallest correct implementation.
- Prefer standard-library, platform, and already-installed capabilities.
- Use clear domain names and direct control flow.
- Keep functions and modules cohesive; split only at a real responsibility boundary.
- Remove duplication only when the shared concept is stable and obvious.
- Comments should explain constraints, intent, or non-obvious tradeoffs.
- Do not hide failures with broad catches, silent defaults, or weakened assertions.
- Do not perform drive-by formatting or unrelated cleanup.
- Leave touched code no harder to understand than before.

#### Dependencies and generated artifacts

- Do not add or upgrade dependencies unless required by the task and approved by repository policy.
- Use the detected package/build tool and committed lock state.
- Review transitive, license, runtime, and supply-chain impact for dependency changes.
- Never hand-edit generated output when a source file or generator owns it.
- Run generators only when their inputs intentionally changed.
- Keep generated diffs scoped and reproducible.

#### Security and data safety

- Never print, copy, commit, or persist credentials or secret values.
- Read environment examples and variable names, not private environment contents.
- Use parameterized queries and framework-native escaping and validation.
- Enforce authorization at the trusted server or domain boundary, not only in a client.
- Treat file paths, URLs, redirects, uploads, deserialization, and shell arguments as untrusted input.
- Do not weaken TLS, CORS, CSRF, authentication, or permission checks to make a test pass.
- Use local/test data stores; never mutate production or shared remote data without explicit authority.
- Ask before destructive commands, migrations, deployments, or broad filesystem changes.

#### Skill routing

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

#### Conditional subagent delegation

- Do not delegate trivial fixes, single-file mechanical edits, or ordinary command runs.
- For medium work, delegate one bounded read-only mapping or test-discovery task when it reduces uncertainty.
- For large or risky work, use one level of focused subagents for mapping, plan checking, implementation slices, tests, and review.
- Never create recursive subagent trees.
- Give every subagent a concrete question, file boundary, and concise output format.
- Keep writer file sets non-overlapping; serialize work on shared manifests, schemas, migrations, and central interfaces.
- Wait for relevant subagents, then let the main agent synthesize decisions and own the final patch.
- Ruflo may track durable state for three or more dependent workstreams; Codex agents still perform the work.
- Never store secrets, private source content, or raw sensitive logs in orchestration memory.

#### Testing strategy

- Start with the narrowest test that exercises the changed behavior.
- Add or update tests when behavior changes.
- Prefer behavior assertions over private implementation details.
- Cover success, relevant failure, boundary, and permission paths.
- Keep tests deterministic; avoid arbitrary sleeps and uncontrolled network dependencies.
- Use existing fixtures and test helpers before creating new frameworks.
- Run broader integration or end-to-end checks when the touched boundary justifies them.
- Preserve useful failure output and distinguish environmental blockers from product failures.

#### Validation order

Use commands discovered from repository docs, manifests, and CI in this order when applicable:

1. Focused test for the touched behavior.
2. Relevant unit or component test group.
3. Type or static analysis.
4. Lint and formatting checks.
5. Integration or end-to-end checks.
6. Build or full test suite when risk warrants it.

Do not claim a check passed unless it actually ran successfully.

#### Review before handoff

- Inspect the final diff for accidental edits, generated noise, secrets, and scope creep.
- Confirm new failure paths return useful errors without exposing sensitive data.
- Confirm tests fail for the intended reason before the fix when practical.
- Ensure documentation and examples match changed public behavior or configuration.
- Report commands run, results, commands not run, and remaining risks.
- Do not commit, push, deploy, or create external issues unless requested.

#### Definition of done

- The requested behavior is implemented or the requested analysis is complete.
- Applicable acceptance criteria are demonstrably satisfied.
- Relevant tests and quality gates pass, or blockers are reported precisely.
- Existing user work and unrelated behavior remain intact.
- The diff is cohesive, reviewable, and free of avoidable complexity.
- Any follow-up is necessary rather than speculative.

#### Reference anchors

- OWASP secure development practices: https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/
- Git documentation: https://git-scm.com/docs

### node

Apply this profile in addition to the generic profile. Preserve the repository's JavaScript or TypeScript conventions and supported Node range.

#### Discover the workspace

- Read `package.json`, the active lockfile, workspace config, and the nearest TypeScript config.
- Detect npm, pnpm, Yarn, or Bun from `packageManager`, lockfiles, and existing commands.
- Use the same package manager throughout the task.
- Inspect `engines`, CI versions, `.nvmrc`, `.node-version`, or toolchain files before using a newer runtime feature.
- In a monorepo, identify the owning package and its dependency boundaries before editing.
- Prefer package-level or affected-workspace commands over running every package.

#### Modules and package contracts

- Preserve the existing ESM, CommonJS, or mixed-module strategy.
- Respect `type`, `exports`, `imports`, entry points, and published declaration files.
- Do not change import extensions, default/named exports, or interop conventions casually.
- Treat an `exports` map as a public package boundary.
- Keep internal modules internal; do not create a public export solely to simplify a test.
- Avoid deep imports across workspace packages when a supported public entry point exists.
- Keep browser-only, server-only, and shared modules separated in full-stack packages.

#### Architecture and data flow

- Keep HTTP, queue, CLI, or worker entry points thin.
- Put domain decisions in cohesive modules that can be tested without starting the process.
- Keep filesystem, network, database, clock, randomness, and process access at explicit boundaries.
- Reuse the repository's dependency-injection or composition pattern; do not introduce a container for one dependency.
- Validate untyped JSON, request data, environment values, and message payloads at runtime boundaries.
- Preserve error types and result conventions used by callers.
- Do not mix callback, promise, and stream styles without a boundary adapter.

#### TypeScript and JavaScript conventions

- Follow the repository's strictness and lint configuration.
- Prefer precise types and narrowing over `any`, unchecked assertions, or duplicated runtime shapes.
- Use `unknown` for untrusted values until validated.
- Preserve discriminated unions and exhaustiveness checks where present.
- Avoid widening a public type to accommodate one implementation shortcut.
- In JavaScript, use JSDoc only when the project already relies on it or it materially clarifies a public contract.
- Let the configured formatter own layout.

#### Async work and lifecycle

- Await work whose completion affects correctness.
- Propagate cancellation or abort signals through supported I/O boundaries.
- Handle stream errors and backpressure with existing stream primitives.
- Do not leave floating promises or asynchronous work after a test finishes.
- Make process startup and shutdown explicit for servers, pools, workers, and subscriptions.
- Preserve graceful shutdown signals and exit-code behavior.
- Avoid blocking the event loop with large synchronous CPU or filesystem work on request paths.
- Add concurrency only after identifying independent work and failure semantics.

#### Configuration and security

- Read configuration through the project's existing configuration boundary.
- Validate required environment variables at startup without logging their values.
- Do not read `.env` secrets for reporting or commit environment-specific configuration.
- Use built-in URL, path, crypto, and encoding APIs rather than ad hoc parsing.
- Never interpolate user input into shell commands, SQL, HTML, or file paths.
- Preserve framework-native cookie, CSRF, CORS, session, and proxy settings.
- Keep production stack traces and internal error details out of client responses.

#### Dependencies

- Use an existing dependency or Node built-in before adding a package.
- Preserve the lockfile and package-manager version.
- Use the package manager command that updates both manifest and lockfile.
- Avoid install scripts or remote code execution unless explicitly required and reviewed.
- Check runtime versus development dependency placement.
- Do not upgrade unrelated packages while implementing a feature or fix.

#### Commands

Prefer declared scripts, using the detected package manager:

```text
<pm> run <focused-script>
<pm> test -- <supported-filter>
<pm> run typecheck
<pm> run lint
<pm> run build
```

- Do not assume every script exists.
- Pass filters using the syntax supported by the configured test runner.
- In a workspace, use the repository's filter or affected-command convention.

#### Testing

- Keep tests beside the existing unit or integration convention.
- Use the configured runner; use `node:test` when it is already the project choice.
- Test exported behavior, observable side effects, and error contracts.
- Close servers, timers, file handles, database pools, and workers in teardown.
- Mock at I/O boundaries, not every internal function.
- Avoid real network calls in unit tests.
- For HTTP code, cover status, body, validation, authentication, and authorization behavior.
- For packages, test supported entry points rather than private source paths.

#### Skill routing and delegation

- Use `nodejs-general` when available for Node or TypeScript implementation and validation.
- Add `targeted-codebase-work` for a bounded change in a large workspace.
- Use the generic planning, debugging, QA, and clean-code skill routes as applicable.
- For a medium monorepo change, delegate read-only package mapping or command discovery once.
- For independent package slices, use one-level non-overlapping workers and keep shared manifests serialized.
- The main agent owns module-boundary, lockfile, and public-export decisions.

#### Definition of done

- The supported Node and module strategy remain intact.
- Manifest, lockfile, types, runtime code, and tests agree.
- Relevant focused tests and declared checks pass.
- Resource lifecycle and error paths are verified.
- No secret, generated output, or unrelated dependency change entered the diff.

#### Reference anchors

- Node package and module contracts: https://nodejs.org/api/packages.html
- Node test runner: https://nodejs.org/api/test.html
- Node environment variables: https://nodejs.org/api/environment_variables.html
<!-- codex-kit:project:end -->
