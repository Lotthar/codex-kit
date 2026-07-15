---
name: playwright-e2e-setup
description: Create, repair, or improve a project-scoped Playwright end-to-end testing setup for web applications, including configuration, projects, authentication state, responsive coverage, diagnostics, accessibility, visual checks, CI, and Codex-friendly workflows. Use when asked to install, scaffold, configure, or modernize Playwright E2E infrastructure; do not use merely to run an existing test suite.
---

# Playwright E2E Setup

Build the smallest maintainable Playwright setup that matches the repository. Reuse existing configuration, scripts, fixtures, auth helpers, test conventions, and CI before adding anything.

## Safety and scope

- Read applicable `AGENTS.md`, manifests, lockfiles, workspace config, app start commands, routes, auth code, existing tests, CI, and ignore files before editing.
- Preserve the selected package manager and dependency style. Ask before installing dependencies or using the network.
- Use local/test accounts and services only. Never commit credentials, tokens, storage state, session data, traces containing secrets, or private certificates.
- Avoid changing product code unless the requested setup requires a minimal testability hook and the user authorizes it.
- Do not replace a working E2E stack without an explicit request.
- Keep generated reports, screenshots, videos, traces, and auth state ignored.

## Decision sequence

1. Detect whether Playwright already exists. If it does, repair or extend it instead of scaffolding a parallel setup.
2. Identify workspace/package ownership, package manager, test runner, app start command, base URL, CI environment, route inventory, auth modes, and existing accessibility or visual tools.
3. Propose the smallest file layout and dependency changes. Preview new scripts, projects, secrets, and CI effects before mutation.
4. Add Playwright through the repository's package manager only when it is absent and installation is approved.
5. Configure deterministic local execution, artifact retention on failure, timeouts, retries, parallelism, and web server reuse according to existing CI/local conventions.
6. Add a thin smoke test first and run it before expanding coverage.
7. Add auth, responsive, diagnostic, accessibility, or visual infrastructure only when repository requirements justify it. Read the relevant reference before implementing:
   - [auth-and-projects.md](references/auth-and-projects.md)
   - [diagnostics-and-coverage.md](references/diagnostics-and-coverage.md)
8. Add CI using the repository's existing workflow conventions. Cache dependencies, install the pinned browser build, upload artifacts on failure, and avoid duplicate app startup.
9. Run targeted validation, inspect the diff, and document exact commands plus any credentials or services the user must supply by variable name only.

## Recommended shape

Follow repository conventions first. A typical setup may contain:

```text
playwright.config.ts
e2e/
  tests/
  fixtures/
  auth/
  support/
```

Do not create every directory speculatively. Start with config plus one smoke spec; add helpers only after a second use proves the boundary.

## Configuration requirements

- Resolve base URL and ports from existing config or environment variables; do not hardcode secrets or remote production URLs.
- Use the existing start command in `webServer` when stable; otherwise document the separate startup process.
- Keep local reuse enabled when safe and disabled in CI.
- Collect trace, screenshot, and video primarily on failure or retry to control cost.
- Choose projects from actual support requirements. Do not multiply every browser by every viewport by every role without evidence.
- Keep CI retries bounded and local retries low so failures remain visible.
- Prefer role/name/label/test-id locators over brittle CSS and XPath.

## Conditional delegation

For a non-trivial setup spanning application discovery, auth, test architecture, and CI, use one level of bounded subagents:

- a read-only repository/auth mapper;
- a test-and-project designer;
- a CI/docs impact scout;
- a final validation or diff reviewer.

When Codex Kit model routing is installed, use `codex_kit_mapper` for repository/auth discovery, `codex_kit_support` for test and CI research, `codex_kit_worker` for isolated writer slices, and `codex_kit_reviewer` for final validation. Fall back to ordinary bounded roles when a Kit role is unavailable.

Skip subagents for a small repair to an existing config. Subagents must not spawn children. Give writers non-overlapping file ownership; keep shared config, package manifests, lockfiles, and final integration in the parent thread. Never let multiple browser agents control the same app instance concurrently.

## Initial coverage

Add only evidence-backed tests, usually in this order:

1. Public smoke route and core shell.
2. One critical user journey.
3. Authenticated smoke using the safest supported auth mode.
4. Responsive overflow/navigation check for supported breakpoints.
5. Accessibility smoke using already-approved tooling or native assertions.
6. Visual baselines only for stable, valuable surfaces with deterministic data.

## Validation

Run the narrowest configured command first, then the relevant project suite:

- list tests to verify discovery;
- execute one smoke project;
- run the authenticated project when credentials are safely available;
- run typecheck/lint for touched TypeScript/config files;
- run CI-equivalent E2E if practical;
- inspect reports, traces, console errors, and failed requests.

Do not claim browser coverage that was not executed. Report browsers not installed, missing test accounts, unavailable services, and CI-only checks explicitly.

## Handoff

Summarize files changed, package scripts, projects and roles, environment variable names, local and CI commands, validation results, artifacts, blocked checks, and the next test worth adding. Keep setup guidance in project docs or a local skill, not as another loose root prompt.
