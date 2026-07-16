# Continuous Clean Code Refactor Playbook

Prefer repo-local idioms over generic cleanup rules. Use this playbook as a set of prompts for judgment, not a mandate to rewrite.

## Language-Agnostic Guidance

- Start with behavior protection: read tests, public entry points, contracts, and error paths before moving code.
- Reduce complexity in place first. Guard clauses, clearer names, and smaller private helpers often beat new architecture.
- Keep abstractions honest. Extract only when the shared concept has a stable name and the call sites become clearer.
- Preserve boundaries that carry policy: validation, authorization, logging, audit, transactions, retries, concurrency, caching, framework hooks, and public APIs.
- Make one coherent batch at a time and verify it before continuing.

## TypeScript/JavaScript

- Respect existing module style, strictness, path aliases, and lint rules. Prefer explicit exported types and narrow union handling when the repo already uses them.
- Replace nested optional checks with clear early returns or small predicates when it clarifies intent.
- Remove unused exports only after checking imports, tests, story files, dynamic entry points, and framework conventions.
- Avoid converting CommonJS to ESM, changing build targets, or broad formatter churn unless the repo already standardizes that migration.

## React/Next.js

- Keep components focused around one UI responsibility. Extract hooks for stateful behavior only when the hook has a reusable concept, not just to move code elsewhere.
- Preserve server/client component boundaries, route conventions, data-fetching semantics, caching behavior, and loading/error states.
- Prefer readable props and component names over generic wrapper components. Remove wrapper layers only when they add no styling, accessibility, analytics, error handling, or layout boundary.
- Keep accessibility semantics intact when simplifying markup.

## Node.js Backends

- Preserve request validation, auth, rate limits, logging, tracing, error mapping, idempotency, transactions, and response contracts.
- Separate transport glue from domain decisions when the codebase already has service/use-case boundaries.
- Prefer small pure helpers for parsing and decision logic, but keep I/O boundaries explicit.
- Avoid changing async ordering, concurrency, retry behavior, or error propagation unless the user authorized behavior changes.

## Python

- Follow existing package layout, typing level, formatting, and test style. Prefer clear functions and dataclasses only where they fit local practice.
- Replace broad condition nesting with early returns when exceptions, context managers, and cleanup semantics remain unchanged.
- Keep import-time side effects, framework decorators, CLI entry points, and fixture behavior stable.
- Avoid overusing classes when simple functions or modules are idiomatic for the project.

## Java/Kotlin

- Preserve public method signatures, annotations, transaction boundaries, dependency injection wiring, nullability contracts, and framework lifecycle hooks.
- Use guard clauses where they improve readability without skipping required cleanup or finally behavior.
- Extract cohesive private methods or small collaborators when they reflect domain concepts, not just line count.
- Avoid introducing interfaces solely for one implementation unless architecture or testing clearly benefits.

## C#/.NET

- Preserve public contracts, attributes, DI registrations, middleware order, async semantics, cancellation token propagation, and LINQ query translation behavior.
- Prefer expressive private methods, records, or value objects only when they match project style and improve clarity.
- Keep validation, authorization, logging, and transaction scopes visible.
- Do not change nullable annotations or exception behavior casually.

## Go

- Keep small interfaces at consumer boundaries and avoid broad interface extraction.
- Preserve explicit error handling and wrapping semantics. Guard clauses are idiomatic when they make error paths clear.
- Respect package boundaries, exported identifiers, context propagation, and concurrency/cancellation behavior.
- Avoid hiding simple logic behind generic helpers that make call sites harder to scan.

## Rust

- Preserve ownership, lifetimes, error types, feature flags, and public APIs.
- Prefer pattern matching, early `?`, and small functions when they clarify flow.
- Avoid abstraction through traits unless polymorphism or test boundaries are already real needs.
- Keep unsafe, synchronization, and allocation behavior visible and reviewed carefully.

## Swift

- Respect value/reference semantics, access control, protocol boundaries, async/await behavior, property wrappers, and platform lifecycle hooks.
- Simplify view/controller logic by extracting named private methods or focused view models only when the responsibility is clear.
- Keep user-visible strings, accessibility labels, and state transitions stable.
- Avoid broad architectural moves between MVC, MVVM, SwiftUI, and UIKit without explicit authorization.

## Ruby/Rails

- Preserve routes, callbacks, validations, scopes, transactions, background job behavior, and ActiveRecord query semantics.
- Prefer intention-revealing private methods and service extraction only when it removes meaningful model/controller bloat.
- Use guard clauses for controller/model branches when before/after callbacks and render/redirect flow remain correct.
- Avoid meta-programming cleanup unless tests cover the dynamic behavior.

## PHP/Laravel

- Preserve routes, middleware, request validation, authorization policies, service container bindings, events, queued jobs, and database transaction behavior.
- Prefer form requests, small services, and explicit domain names when the repo already uses those patterns.
- Simplify nested controller logic with early returns while keeping response codes, redirects, and flashes stable.
- Avoid changing Eloquent eager loading, casts, accessors, or query scopes without tests.

## SQL/Data Access

- Preserve result shape, ordering, filtering, null handling, transaction scope, locking, isolation, and index usage expectations.
- Remove duplication by naming common query fragments only when the database layer supports it cleanly.
- Keep migrations and schema changes out of behavior-preserving cleanup unless explicitly requested.
- Validate query refactors with tests, explain plans, or representative fixtures when available.

## Test Code

- Improve tests by clarifying setup, names, fixtures, and assertions without weakening coverage.
- Remove duplication in test helpers only when failure messages and scenario intent remain clear.
- Preserve regression coverage and edge cases. Do not delete tests because production code became simpler.
- If baseline tests fail, record exact failures before editing and avoid hiding them with weaker assertions.
