# Node.js profile

Apply this profile in addition to the generic profile. Preserve the supported Node range, package manager, and module strategy.

## Workspace and architecture

- Read `package.json`, the active lockfile, workspace config, TypeScript config, engines, and CI before choosing commands or runtime features.
- Preserve ESM/CommonJS, `exports`/`imports`, entry points, declaration files, and browser/server boundaries. Keep HTTP, CLI, queue, and worker entry points thin.
- Put domain decisions in testable modules; validate JSON, requests, messages, and environment values at runtime boundaries. Keep filesystem, network, database, clock, and process access explicit.

## Security and lifecycle

- Use the project configuration boundary; never print `.env` values or interpolate untrusted input into shell, SQL, HTML, or paths.
- Await correctness-critical work, preserve cancellation and shutdown behavior, and do not leave floating promises or leaked handles.
- Use Node built-ins or existing dependencies first; do not change manifests or lockfiles for unrelated work.

## Commands and testing

- Use the detected package manager and declared package/workspace scripts: focused test, typecheck, lint, then build when the changed boundary warrants it.
- Test observable behavior and error contracts; mock I/O, close resources in teardown, and avoid real network calls in unit tests.

## Skill routing and definition of done

- Use `nodejs-general` for Node work and `targeted-codebase-work` for bounded large-workspace changes; keep manifest, lockfile, and public-export decisions under one owner.
- Node/module contracts, runtime types, tests, and lifecycle behavior agree; no secret, generated output, or unrelated dependency change enters the diff.

## Reference anchors

- Node packages: https://nodejs.org/api/packages.html
- Node test runner: https://nodejs.org/api/test.html
