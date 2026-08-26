# Angular profile

Apply this profile after the generic and Node profiles. Preserve the workspace Angular version, standalone or NgModule style, builder, and monorepo conventions.

## Discover the workspace

- Read `angular.json`, package/TypeScript config, lockfile, project config, and nearest feature, route, state, service, component, and test patterns. For Nx, honor project boundaries, tags, and affected commands.
- Never edit caches, build output, generated clients, or generated code. Use schematics only when their output follows the workspace structure.

## Architecture and components

- Organize by feature/domain; keep components for presentation and interaction, and use existing services, stores, facades, or domain modules for reusable data and state. Preserve lazy routes and public library entry points.
- Respect import constraints and do not create a shared dumping ground or second state layer. Follow the local standalone/NgModule model without migrating unrelated code.
- Keep template expressions deterministic and cheap, track lists by stable identity, and prefer computed state to imperative synchronization. Use signals/control flow only when supported and already appropriate; dispose manual subscriptions by the established lifecycle pattern.

## Input, security, and UX

- Preserve form style; map view models to API contracts at a clear boundary, show associated accessible errors, and represent pending submission to avoid duplicate actions.
- Use Angular bindings and sanitization. Treat `bypassSecurityTrust*` as a documented exception; never concatenate untrusted values into DOM, URL, or style APIs. Server authorization remains authoritative; guards are UX.
- Preserve semantic HTML, labels, focus, keyboard behavior, visible async states, dialogs/overlay focus handling, and supported responsive behavior.

## Commands and testing

- Use declared scripts or configured Angular/Nx targets: focused project test, lint, build, then affected targets or production configuration when warranted.
- Test pure services/state without Angular setup; use `TestBed` for DI, templates, providers, or lifecycle. Prefer user-visible DOM behavior, and cover changed input/output, async, validation, and accessibility paths.

## Skill routing and completion

- Use `ui-feature-implementation` for Angular UI, and existing browser tests for regressions; use `playwright-e2e-setup` only to create or modernize browser-test infrastructure. Keep root config, shared types, manifests, and lockfiles under one owner.
- Done: Angular style and workspace boundaries are consistent, trusted validation/authorization remains intact, relevant tests/type/lint/affected builds pass, and generated files or unrelated migrations remain untouched.

## Reference anchors

- Angular style guide: https://angular.dev/style-guide
- Angular component testing: https://angular.dev/guide/testing/components-basics
- Angular security: https://angular.dev/best-practices/security
