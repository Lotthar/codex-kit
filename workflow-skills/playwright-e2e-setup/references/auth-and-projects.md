# Authentication and Playwright projects

Select the least privileged, most deterministic auth method supported by the application.

## Auth choices

Prefer, in order when the application supports them:

1. A dedicated local/test API or fixture login that exercises the intended auth boundary.
2. A setup project that signs in through the UI and writes per-role storage state.
3. A documented bearer token or cookie injected from environment variables.
4. Manual interactive setup only for flows that cannot be automated safely, such as external SSO with user-controlled MFA.

Never bypass authorization checks, embed credentials, or commit generated state. Validate that saved state is scoped to the intended local/test origin and role.

## Storage rules

- Put generated state under an ignored directory such as `playwright/.auth/`.
- Use one file per role and environment; never share admin state with lower-privilege projects.
- Regenerate state when expired rather than hiding failures with arbitrary retries.
- Avoid logging cookies, tokens, authorization headers, or full storage-state content.
- Prefer environment variable names and example placeholders in docs.

## Session storage and nonstandard clients

Playwright storage state does not persist `sessionStorage`. When the app depends on it, use a small documented fixture that restores only the required local/test value before navigation. Keep values out of source control and avoid copying unrelated browser storage.

For IndexedDB or service-worker auth, first verify whether current Playwright storage-state support covers the application. Add custom export/import only when a targeted test demonstrates the gap.

## Project design

Use setup dependencies to establish shared state. Define only projects required by actual product support:

- a default desktop browser;
- additional browser engines required by support policy;
- mobile/tablet viewports for meaningful responsive behavior;
- authenticated role projects where permission boundaries matter.

Avoid a full Cartesian product. A small risk-based matrix is easier to trust and maintain. Use project dependencies or tags to separate public, authenticated, role-specific, visual, and accessibility checks.

## Multi-role and parallel tests

- Create isolated browser contexts per role.
- Use unique fixture data or namespaces so tests can run independently.
- Do not reuse a mutable account across parallel workers unless the app guarantees isolation.
- Verify both allowed and forbidden actions for important roles.
- Keep test cleanup local and deterministic; never reset shared environments.
