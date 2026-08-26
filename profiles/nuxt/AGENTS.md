# Nuxt profile

Apply this profile after the generic and Node profiles. Preserve the detected Nuxt version, layout, rendering mode, and deployment preset.

## Scope and discovery

- Read `nuxt.config.*`, package/workspace config, and the existing `app/` or legacy layout; identify route rules, modules, layers, server engine, composables, plugins, middleware, and test setup.
- Never edit `.nuxt/` or `.output/`; preserve aliases, auto-imports, layer override order, and established component style.

## Architecture and rendering

- Keep pages as route composition, reusable UI in components, stateful behavior in composables, APIs in `server/api`, and non-API handlers in `server/routes`.
- Keep browser-only code client-side and secrets/server utilities server-side; `shared/` must be valid in both contexts. Do not make a page client-only to bypass an SSR boundary.
- Decide SSR, hydration, and navigation behavior explicitly. Avoid browser APIs during SSR, keep rendered output deterministic, and treat hydration warnings as defects.

## Data, security, and UX

- Follow the local `useFetch`, `useAsyncData`, or `$fetch` pattern: SSR-aware data uses the former two; event-driven requests use `$fetch`. Handle pending, empty, error, refresh, and stale states.
- Validate server params, query, headers, and bodies; return framework-native safe HTTP errors. Enforce authorization at server/domain boundaries and never proxy sensitive headers blindly.
- Use runtime config correctly: only intentional public values enter the public namespace. Keep private headers, secrets, and request state off the client and out of process-global mutable state.
- Use `NuxtLink` for app navigation and preserve semantic HTML, labels, keyboard/focus behavior, route metadata, and local SEO conventions.

## Commands and testing

- Use declared package/workspace scripts: focused test, typecheck, lint, then build; run generated-type preparation only through repository/Nuxt scripts.
- Test pure composables without Nuxt when possible; use Nuxt runtime tests for auto-imports, plugins, routes, or runtime config; test server handlers at the HTTP boundary.
- For SSR-sensitive changes, verify server rendering plus hydration/navigation; use browser tests for route, accessibility, and hydration-visible behavior.

## Skill routing and completion

- Use `nuxt-agent` for Nuxt work; add `nodejs-general` only for Node/package boundaries and `ui-feature-implementation` for UI flows. Keep `nuxt.config`, runtime config, shared types, and lockfiles under one owner.
- Done: server/client/shared boundaries and caching remain valid, data does not unexpectedly duplicate across SSR/hydration, no generated output or secret-bearing config was changed, and relevant checks pass.

## Reference anchors

- Nuxt directory structure: https://nuxt.com/docs/4.x/directory-structure
- Nuxt data fetching: https://nuxt.com/docs/4.x/getting-started/data-fetching
- Nuxt testing: https://nuxt.com/docs/4.x/getting-started/testing
