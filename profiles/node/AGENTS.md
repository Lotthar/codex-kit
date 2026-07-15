# Node.js profile

Apply this profile in addition to the generic profile. Preserve the repository's JavaScript or TypeScript conventions and supported Node range.

## Discover the workspace

- Read `package.json`, the active lockfile, workspace config, and the nearest TypeScript config.
- Detect npm, pnpm, Yarn, or Bun from `packageManager`, lockfiles, and existing commands.
- Use the same package manager throughout the task.
- Inspect `engines`, CI versions, `.nvmrc`, `.node-version`, or toolchain files before using a newer runtime feature.
- In a monorepo, identify the owning package and its dependency boundaries before editing.
- Prefer package-level or affected-workspace commands over running every package.

## Modules and package contracts

- Preserve the existing ESM, CommonJS, or mixed-module strategy.
- Respect `type`, `exports`, `imports`, entry points, and published declaration files.
- Do not change import extensions, default/named exports, or interop conventions casually.
- Treat an `exports` map as a public package boundary.
- Keep internal modules internal; do not create a public export solely to simplify a test.
- Avoid deep imports across workspace packages when a supported public entry point exists.
- Keep browser-only, server-only, and shared modules separated in full-stack packages.

## Architecture and data flow

- Keep HTTP, queue, CLI, or worker entry points thin.
- Put domain decisions in cohesive modules that can be tested without starting the process.
- Keep filesystem, network, database, clock, randomness, and process access at explicit boundaries.
- Reuse the repository's dependency-injection or composition pattern; do not introduce a container for one dependency.
- Validate untyped JSON, request data, environment values, and message payloads at runtime boundaries.
- Preserve error types and result conventions used by callers.
- Do not mix callback, promise, and stream styles without a boundary adapter.

## TypeScript and JavaScript conventions

- Follow the repository's strictness and lint configuration.
- Prefer precise types and narrowing over `any`, unchecked assertions, or duplicated runtime shapes.
- Use `unknown` for untrusted values until validated.
- Preserve discriminated unions and exhaustiveness checks where present.
- Avoid widening a public type to accommodate one implementation shortcut.
- In JavaScript, use JSDoc only when the project already relies on it or it materially clarifies a public contract.
- Let the configured formatter own layout.

## Async work and lifecycle

- Await work whose completion affects correctness.
- Propagate cancellation or abort signals through supported I/O boundaries.
- Handle stream errors and backpressure with existing stream primitives.
- Do not leave floating promises or asynchronous work after a test finishes.
- Make process startup and shutdown explicit for servers, pools, workers, and subscriptions.
- Preserve graceful shutdown signals and exit-code behavior.
- Avoid blocking the event loop with large synchronous CPU or filesystem work on request paths.
- Add concurrency only after identifying independent work and failure semantics.

## Configuration and security

- Read configuration through the project's existing configuration boundary.
- Validate required environment variables at startup without logging their values.
- Do not read `.env` secrets for reporting or commit environment-specific configuration.
- Use built-in URL, path, crypto, and encoding APIs rather than ad hoc parsing.
- Never interpolate user input into shell commands, SQL, HTML, or file paths.
- Preserve framework-native cookie, CSRF, CORS, session, and proxy settings.
- Keep production stack traces and internal error details out of client responses.

## Dependencies

- Use an existing dependency or Node built-in before adding a package.
- Preserve the lockfile and package-manager version.
- Use the package manager command that updates both manifest and lockfile.
- Avoid install scripts or remote code execution unless explicitly required and reviewed.
- Check runtime versus development dependency placement.
- Do not upgrade unrelated packages while implementing a feature or fix.

## Commands

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

## Testing

- Keep tests beside the existing unit or integration convention.
- Use the configured runner; use `node:test` when it is already the project choice.
- Test exported behavior, observable side effects, and error contracts.
- Close servers, timers, file handles, database pools, and workers in teardown.
- Mock at I/O boundaries, not every internal function.
- Avoid real network calls in unit tests.
- For HTTP code, cover status, body, validation, authentication, and authorization behavior.
- For packages, test supported entry points rather than private source paths.

## Skill routing and delegation

- Use `nodejs-general` when available for Node or TypeScript implementation and validation.
- Add `targeted-codebase-work` for a bounded change in a large workspace.
- Use the generic planning, debugging, QA, and clean-code skill routes as applicable.
- For a medium monorepo change, delegate read-only package mapping or command discovery once.
- For independent package slices, use one-level non-overlapping workers and keep shared manifests serialized.
- The main agent owns module-boundary, lockfile, and public-export decisions.

## Definition of done

- The supported Node and module strategy remain intact.
- Manifest, lockfile, types, runtime code, and tests agree.
- Relevant focused tests and declared checks pass.
- Resource lifecycle and error paths are verified.
- No secret, generated output, or unrelated dependency change entered the diff.

## Reference anchors

- Node package and module contracts: https://nodejs.org/api/packages.html
- Node test runner: https://nodejs.org/api/test.html
- Node environment variables: https://nodejs.org/api/environment_variables.html
