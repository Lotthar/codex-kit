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

This profile supplies the small, always-loaded rules for every Codex Kit project. Use the matching on-demand skill for detailed framework, migration, QA, or release workflows.

#### Scope and discovery

- Follow system, user, root `AGENTS.md`, then nearest path instructions; an approved plan beats this profile.
- Preserve public behavior, requested scope, and unrelated user changes. Check Git status before editing.
- Start with exact symbols, callers, tests, the smallest manifest/config, and repository scripts; do not load the whole repository when a focused map is enough.
- Identify generated, vendored, migration, fixture, and lock files before touching them; separate baseline failures from new ones.

#### Implementation and safety

- Reuse local patterns, the standard library, and installed capabilities; keep domain decisions separate from transport, storage, UI, and framework glue where the project does.
- Validate untrusted input at trust boundaries; keep side effects explicit; preserve public contracts unless a migration is requested.
- Never expose secrets, weaken auth/TLS/CORS/CSRF, mutate shared or production data, or hand-edit generated output. Ask before destructive operations, migrations, deployments, or broad filesystem effects.
- Keep changes cohesive. Do not add speculative abstractions, dependencies, or unrelated cleanup.

#### Plan, delegation, and validation

- Reviews are read-only unless changes are requested. Diagnose before fixing; plan cross-cutting or risky changes and add deterministic regression coverage when behavior changes.
- Do not delegate trivial work. For medium or larger work, use one level of focused subagents with non-overlapping ownership; never create recursive subagent trees.
- Wait for relevant subagents; the main agent synthesizes decisions and owns the final patch.
- Run the narrowest relevant test first, then applicable type, lint, integration, and build checks. Do not claim a check passed without evidence.
- Review the final diff for scope, generated noise, secrets, and useful failure behavior; report results, skipped checks, and necessary follow-up.

#### Definition of done

- Requested behavior or analysis is complete, acceptance criteria have evidence, and unrelated work is preserved.
- Relevant validation passed or its blocker is stated precisely; no commit, push, deployment, or external issue without a request.

#### Reference anchors

- OWASP secure development practices: https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/
- Git documentation: https://git-scm.com/docs

### node

Apply this profile in addition to the generic profile. Preserve the supported Node range, package manager, and module strategy.

#### Workspace and architecture

- Read `package.json`, the active lockfile, workspace config, TypeScript config, engines, and CI before choosing commands or runtime features.
- Preserve ESM/CommonJS, `exports`/`imports`, entry points, declaration files, and browser/server boundaries. Keep HTTP, CLI, queue, and worker entry points thin.
- Put domain decisions in testable modules; validate JSON, requests, messages, and environment values at runtime boundaries. Keep filesystem, network, database, clock, and process access explicit.

#### Security and lifecycle

- Use the project configuration boundary; never print `.env` values or interpolate untrusted input into shell, SQL, HTML, or paths.
- Await correctness-critical work, preserve cancellation and shutdown behavior, and do not leave floating promises or leaked handles.
- Use Node built-ins or existing dependencies first; do not change manifests or lockfiles for unrelated work.

#### Commands and testing

- Use the detected package manager and declared package/workspace scripts: focused test, typecheck, lint, then build when the changed boundary warrants it.
- Test observable behavior and error contracts; mock I/O, close resources in teardown, and avoid real network calls in unit tests.

#### Skill routing and definition of done

- Use `nodejs-general` for Node work and `targeted-codebase-work` for bounded large-workspace changes; keep manifest, lockfile, and public-export decisions under one owner.
- Node/module contracts, runtime types, tests, and lifecycle behavior agree; no secret, generated output, or unrelated dependency change enters the diff.

#### Reference anchors

- Node packages: https://nodejs.org/api/packages.html
- Node test runner: https://nodejs.org/api/test.html
<!-- codex-kit:project:end -->
