# QA test matrix

Use this as a selection guide, not a mandatory checklist. Test only surfaces supported by repository evidence.

## UI and browser

- Navigation, routing, deep links, refresh, and back/forward behavior
- Logged-out, logged-in, expired-session, and forbidden-role states
- Forms with valid, invalid, empty, boundary, duplicate, and safely escaped hostile-looking input
- CRUD and multi-step workflows, including duplicate submission and interruption
- Loading, empty, success, warning, offline, and server-error states
- Dialog, drawer, focus trap, dismissal, and restoration behavior
- Mobile, tablet, desktop, narrow viewport, zoom, overflow, truncation, and layout shift
- Keyboard navigation, visible focus, accessible names, headings, landmarks, live regions, and reduced motion
- Browser console errors, failed requests, caching, redirects, and stale-session behavior

## API and backend

- Happy paths and contract/schema consistency
- Boundary validation and intentional error response shapes
- Authentication and authorization, including object-level access with local fixtures
- Pagination, filtering, sorting, search, and invalid cursor/page values
- Idempotency, duplicate requests, retries, concurrency, and transaction boundaries where safe
- Missing dependencies, timeouts, downstream failures, and observability without secret leakage
- File upload/download validation, content type, size, name, and access control

## Database and persistence

- Migration order, rollback support, and clean-database bootstrap
- Required, unique, check, foreign-key, and domain constraints
- Cascades, soft deletion, audit fields, ownership, and tenant isolation
- Successful persistence and absence of writes after validation failure
- Transaction rollback, retry behavior, race cases, seeds, fixtures, and reset reproducibility

## Integrations and asynchronous work

- Queues, workers, retries, dead-letter behavior, scheduled jobs, and duplicate delivery
- Email/notification output through local sinks or mocks
- Webhooks with local fixtures, signature checks, replay/idempotency, and failure responses
- Payments and third-party APIs through documented sandbox or mocks only
- Realtime connections, reconnects, ordering, and authorization when present

## Security-negative boundaries

- Route, action, object, role, and tenant authorization
- Session expiry, logout invalidation, CSRF assumptions, and safe redirect handling
- Sensitive values absent from UI, API errors, logs, traces, and artifacts
- Input escaping indicators and upload restrictions using safe local tests
- Never perform denial-of-service, credential theft, phishing, persistence, destructive, or external attack testing.
