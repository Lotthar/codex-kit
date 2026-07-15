# Nuxt profile

Apply this profile after the generic and Node profiles. Follow the detected Nuxt major version and the repository's established `app/`, legacy root, layer, or monorepo layout.

## Discover Nuxt conventions

- Read `nuxt.config.*`, `package.json`, generated type scripts, and workspace configuration.
- Inspect `app/` or the repository's existing source directory before assuming Nuxt's default layout.
- Identify rendering mode, route rules, modules, layers, deployment preset, and server engine configuration.
- Find existing composables, plugins, middleware, server utilities, and test setup before adding new ones.
- Never edit `.nuxt/` or `.output/`; they are generated.
- Preserve aliases, auto-import conventions, and explicit imports already used by the project.

## Architecture and directory boundaries

- Keep page files focused on route composition and page-level state.
- Put reusable UI in components and reusable stateful behavior in composables.
- Keep browser-only code behind client boundaries and server secrets behind server boundaries.
- Place API handlers under the repository's `server/api` convention and non-API routes under `server/routes`.
- Use `shared/` only for code that is safe and valid in both app and server contexts.
- Do not import server-only aliases or secret-bearing configuration into client bundles.
- Use a local module only when framework extension is genuinely cross-cutting.
- Preserve layer override order and avoid copying layer-owned files into the application.

## Rendering and hydration

- Decide whether code runs during SSR, hydration, client navigation, or all three.
- Avoid direct `window`, `document`, storage, and browser API access during SSR.
- Use client-only components or lifecycle hooks only for genuinely browser-only behavior.
- Keep server-rendered and hydrated output deterministic.
- Treat hydration warnings as correctness failures, not harmless console noise.
- Preserve route rules and caching semantics when changing data dependencies.
- Do not make a page client-only merely to avoid fixing an SSR boundary.

## Data fetching and state

- Use the repository's established `useFetch`, `useAsyncData`, or `$fetch` pattern.
- Use `useFetch` or `useAsyncData` for SSR-aware component data that should not be fetched twice.
- Use `$fetch` for event-driven requests or direct server-to-server work where payload hydration is unnecessary.
- Give shared async data stable keys when the project requires them.
- Handle pending, empty, error, refresh, and stale states explicitly.
- Keep request credentials and private headers on the server.
- Do not put request-specific server state in process-global mutable variables.
- Follow the existing state-management choice; do not add a store for local component state.

## Server routes and middleware

- Use method-specific route filenames where the repository follows that convention.
- Validate route params, query values, headers, and request bodies before use.
- Throw framework-native HTTP errors with safe client messages.
- Keep server middleware narrow because it runs across many requests.
- Do not return response bodies from middleware intended only to enrich request context.
- Forward request context or headers only when required; do not proxy sensitive headers blindly.
- Put authorization at the server endpoint or domain boundary even if route middleware also checks navigation.
- Use explicit transaction boundaries for multi-write operations.

## Runtime configuration and secrets

- Read public and private values through Nuxt runtime configuration.
- Expose only intentionally public values through the public runtime namespace.
- Do not embed secrets in app config, payloads, source maps, or client-visible error data.
- Preserve deployment-specific environment overrides.
- Treat Nitro preset, storage, and compatibility changes as deployment-impacting.

## UI conventions

- Preserve the repository's Vue Composition API and component style.
- Keep components accessible with semantic HTML, labels, focus behavior, and keyboard support.
- Use `NuxtLink` for application navigation unless a full document navigation is intended.
- Keep route metadata, middleware, and SEO metadata close to the route conventions already used.
- Avoid watchers when a computed value or direct event flow expresses the dependency.
- Do not destructure reactive values in ways that lose reactivity.

## Commands

Use package scripts first. Common Nuxt commands are only fallbacks when declared or supported:

```text
<pm> run dev
<pm> run test -- <supported-filter>
<pm> run typecheck
<pm> run lint
<pm> run build
```

- Run generated-type preparation only through repository or Nuxt scripts.
- Verify the production build for rendering, module, Nitro, or deployment changes.
- Use workspace filters for an app inside a monorepo.

## Testing

- Keep pure composable and utility tests outside a Nuxt runtime when possible.
- Use the configured Nuxt test environment for behavior that depends on auto-imports, plugins, routing, or runtime config.
- Keep Nuxt runtime tests separate from end-to-end tests to avoid environment conflicts.
- Test server handlers at their HTTP boundary when status, serialization, auth, or middleware matters.
- Test SSR-sensitive changes with server rendering plus client hydration or navigation.
- Cover loading, error, empty, and authenticated states for changed pages.
- Use browser tests for route transitions, accessibility, and hydration-visible behavior.

## Skill routing and delegation

- Use `nuxt-agent` when available for Nuxt implementation details.
- Combine it with `nodejs-general` only when the task also changes Node runtime or package boundaries.
- Use `ui-feature-implementation` for user-visible flows and browser verification when available.
- Delegate route/component mapping or server-boundary review for medium full-stack changes.
- Use separate one-level workers only for non-overlapping app and server slices after their contract is fixed.
- Keep `nuxt.config`, shared types, runtime config, and lockfiles under one writer.

## Definition of done

- Server/client/shared boundaries remain valid.
- No generated Nuxt output was edited.
- Data fetching does not duplicate unexpectedly across SSR and hydration.
- Relevant unit, Nuxt runtime, browser, type, lint, and build checks pass as applicable.
- Runtime configuration exposes no new secret-bearing value.

## Reference anchors

- Nuxt directory structure: https://nuxt.com/docs/4.x/directory-structure
- Nuxt data fetching: https://nuxt.com/docs/4.x/getting-started/data-fetching
- Nuxt testing: https://nuxt.com/docs/4.x/getting-started/testing
