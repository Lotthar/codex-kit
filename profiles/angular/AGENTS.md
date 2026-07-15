# Angular profile

Apply this profile after the generic and Node profiles. Preserve the workspace's Angular version, standalone or NgModule style, builder, and monorepo conventions.

## Discover the workspace

- Read `angular.json`, `package.json`, TypeScript configs, project configs, and the active workspace lockfile.
- If Nx is present, inspect project boundaries, tags, generators, and affected commands.
- Identify standalone bootstrap versus NgModule organization before creating declarations or providers.
- Find the nearest feature, route, state, service, component, and test patterns.
- Use configured schematics or generators only when they preserve local structure and create reviewable output.
- Never edit Angular cache, build output, generated API clients, or generated code directly.

## Architecture and feature boundaries

- Organize changes by user-facing feature or domain, following existing project boundaries.
- Keep components focused on presentation and interaction orchestration.
- Put reusable domain or data-access behavior in existing services, stores, facades, or domain modules.
- Keep route configuration lazy where the workspace already uses lazy feature loading.
- Respect Nx or workspace import constraints; do not bypass them with relative deep imports.
- Keep shared code genuinely reusable; avoid a dumping-ground shared module or utility directory.
- Preserve public library entry points and secondary entry points.
- Do not introduce a new state-management layer for local or short-lived component state.

## Components and templates

- Follow the local standalone or NgModule component model; do not migrate unrelated code.
- Keep one primary Angular concept per file unless tightly coupled small declarations are already conventional.
- Keep inputs, outputs, queries, and injected dependencies easy to find.
- Use `readonly` for Angular-initialized members that should not be reassigned.
- Use `protected` for template-only members when consistent with the project's TypeScript target and style.
- Prefer computed state over imperative synchronization.
- Keep template expressions cheap, deterministic, and free of side effects.
- Use native control flow and signal APIs only when supported by the detected Angular version and local patterns.
- Track repeated lists with stable identity.

## Dependency injection and state

- Prefer the repository's established injection style; Angular's current style guide favors `inject` for new code.
- Do not churn constructor injection in unrelated files.
- Scope providers intentionally at root, route, feature, or component level.
- Avoid hidden mutable singleton state unless application-wide lifetime is intended.
- Use signals for synchronous reactive state when already adopted.
- Use RxJS for asynchronous streams, cancellation, and event composition when it fits existing code.
- Do not mirror the same source of truth across signals, subjects, and component fields.
- Dispose manual subscriptions with the repository's supported lifecycle pattern.

## Forms and user input

- Preserve reactive or template-driven form conventions within the feature.
- Keep validation rules aligned between UI feedback and trusted backend validation.
- Show accessible error text associated with its control.
- Represent pending and submission state explicitly to prevent duplicate actions.
- Do not trust disabled controls or client validation for authorization or integrity.
- Keep form mapping at a clear boundary between view models and API contracts.

## Security and rendering

- Use Angular template binding and built-in sanitization; avoid manual HTML construction.
- Treat `bypassSecurityTrust*` as a security exception requiring explicit justification and trusted input.
- Do not concatenate untrusted values into URLs, styles, resource URLs, or DOM APIs.
- Keep authentication tokens out of logs and browser-persisted state unless the existing security design requires it.
- Enforce authorization on the server; route guards improve UX but are not a security boundary.
- Preserve CSP, trusted-types, and server-side rendering security configuration.

## Accessibility and UX

- Prefer semantic HTML before ARIA.
- Preserve label, name, role, focus, keyboard, and error-announcement behavior.
- Keep loading, empty, error, success, and disabled states visible and testable.
- Verify dialogs, overlays, and route changes manage focus predictably.
- Avoid hiding interactive content solely with visual styling.
- Test responsive behavior at the feature's supported breakpoints.

## Commands

Use declared scripts, Angular CLI, or Nx commands already selected by the workspace:

```text
<pm> run test -- <supported-project-or-filter>
<pm> run lint
<pm> run build
ng test <project>
ng build <project>
nx affected -t test,lint,build
```

- Do not assume every example command is configured.
- Prefer one project or affected targets before the entire workspace.
- Use the repository's production configuration for release-sensitive build validation.

## Testing

- Test pure services, reducers, utilities, and state transformations without unnecessary Angular setup.
- Test components with their template and DOM when rendering or interaction is the behavior.
- Use `TestBed` when dependency injection, templates, providers, or Angular lifecycle behavior matters.
- Prefer user-visible queries and events over private class-member assertions.
- Cover input changes, output events, async states, validation, and accessibility for changed UI.
- Add router or HTTP testing utilities only through the existing test setup.
- Use browser tests for critical navigation and cross-component flows.

## Skill routing and delegation

- Use `ui-feature-implementation` for Angular UI work when available.
- Use `playwright-e2e-setup` when Angular browser-test infrastructure must be created or modernized; use existing tests for ordinary regressions.
- Use generic planning or debugging skills for cross-library and regression work.
- Delegate workspace-boundary mapping or UI test discovery for medium Nx changes.
- Separate one-level library workers only when their public contract is already fixed.
- Keep shared types, root configuration, workspace manifests, and lockfiles under one writer.

## Definition of done

- Standalone/NgModule and workspace boundaries remain consistent.
- Component behavior is accessible and responsive where relevant.
- Trusted validation and authorization boundaries remain intact.
- Focused tests, type checks, lint, and affected builds pass as applicable.
- Generated files and unrelated migrations remain untouched.

## Reference anchors

- Angular style guide: https://angular.dev/style-guide
- Angular component testing: https://angular.dev/guide/testing/components-basics
- Angular security: https://angular.dev/best-practices/security
