# Generic project profile

This profile supplies the small, always-loaded rules for every Codex Kit project. Use the matching on-demand skill for detailed framework, migration, QA, or release workflows.

## Scope and discovery

- Follow system, user, root `AGENTS.md`, then nearest path instructions; an approved plan beats this profile.
- Preserve public behavior, requested scope, and unrelated user changes. Check Git status before editing.
- Start with exact symbols, callers, tests, the smallest manifest/config, and repository scripts; do not load the whole repository when a focused map is enough.
- Identify generated, vendored, migration, fixture, and lock files before touching them; separate baseline failures from new ones.

## Implementation and safety

- Reuse local patterns, the standard library, and installed capabilities; keep domain decisions separate from transport, storage, UI, and framework glue where the project does.
- Validate untrusted input at trust boundaries; keep side effects explicit; preserve public contracts unless a migration is requested.
- Never expose secrets, weaken auth/TLS/CORS/CSRF, mutate shared or production data, or hand-edit generated output. Ask before destructive operations, migrations, deployments, or broad filesystem effects.
- Keep changes cohesive. Do not add speculative abstractions, dependencies, or unrelated cleanup.

## Plan, delegation, and validation

- Reviews are read-only unless changes are requested. Diagnose before fixing; plan cross-cutting or risky changes and add deterministic regression coverage when behavior changes.
- Do not delegate trivial work. For medium or larger work, use one level of focused subagents with non-overlapping ownership; never create recursive subagent trees.
- Wait for relevant subagents; the main agent synthesizes decisions and owns the final patch.
- Run the narrowest relevant test first, then applicable type, lint, integration, and build checks. Do not claim a check passed without evidence.
- Review the final diff for scope, generated noise, secrets, and useful failure behavior; report results, skipped checks, and necessary follow-up.

## Definition of done

- Requested behavior or analysis is complete, acceptance criteria have evidence, and unrelated work is preserved.
- Relevant validation passed or its blocker is stated precisely; no commit, push, deployment, or external issue without a request.

## Reference anchors

- OWASP secure development practices: https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/
- Git documentation: https://git-scm.com/docs
