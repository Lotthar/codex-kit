# Codex Prompt — Set Up a Project-Scoped Playwright E2E Agent Kit

Paste this entire prompt into Codex while Codex is opened at the repository root of the app you want to test.

---

## Mission

You are Codex running inside an existing application repository. Build a framework-agnostic Playwright E2E testing setup optimized for:

- OAuth, SSO, 2FA-adjacent flows, session-token reuse, cookie/localStorage/IndexedDB auth, sessionStorage auth, API login, bearer-token auth, and multi-role tests.
- Desktop, tablet, mobile Chrome, mobile Safari, narrow viewport, and responsive regression coverage.
- Fast diagnosis and repair of UI issues: horizontal overflow, clipped/fixed elements, broken responsive layouts, console/page errors, failed network requests, visual regressions, and accessibility regressions.
- Codex-friendly workflows so future Codex tasks can test, inspect traces, identify likely causes, patch UI/CSS/components, and rerun targeted checks quickly.

Your output must be working project changes, not just advice.

---

## Non-negotiable constraints

1. **Inspect first.** Before writing files, inspect the repository and identify:
   - Package manager and workspace layout.
   - Existing test stack and whether Playwright already exists.
   - Framework/router/dev-server command if detectable.
   - Existing auth patterns: OAuth provider libraries, auth routes, cookies, token storage, session usage, backend login endpoints, test user docs, `.env` examples.
   - Route files and representative public/protected pages.
   - Existing Codex files: `AGENTS.md`, `.agents/skills`, `.codex/config.toml`, CI files.

2. **Do not leak or commit secrets.** Never write real credentials, auth JSON, cookies, tokens, or generated storage state to tracked files. Add/maintain `.gitignore` entries for all auth artifacts.

3. **Do not bypass real-world security.** Do not try to bypass CAPTCHA, MFA, SSO restrictions, third-party IdP controls, bot detection, or production safeguards. Support safe alternatives: test IdP, API auth, seeded test users, manual storage-state capture, Playwright MCP extension/CDP documentation, or environment-provided test tokens.

4. **Prefer project-local reproducibility.** Create a repo-scoped setup that can be re-run. Global Codex habits are useful, but this repo must contain the project-specific Playwright config, auth adapters, route list, diagnostics utilities, and Codex skill.

5. **Be framework-agnostic.** If the app is Node-based, integrate with the root package manager. If the app is not Node-based or the root should not receive JS dev dependencies, create an isolated `e2e/` Node package/workspace that can test any running web app via `E2E_BASE_URL`.

6. **Prefer TypeScript.** Use TypeScript when the repo supports it or when creating an isolated `e2e/` package. Use JavaScript only if it clearly fits the repo better.

7. **Use resilient tests.** Prefer user-facing locators: role, label, placeholder, text, and test id. Avoid brittle CSS selectors unless there is no semantic alternative. Do not add arbitrary sleeps.

8. **Keep changes reviewable.** Make minimal, additive changes. Do not rewrite app code unless a failing diagnostic identifies a concrete UI issue and the fix is small and high-confidence.

9. **Graceful skipping.** Auth-dependent tests must skip with clear messages when credentials/session state are absent. The unauthenticated smoke and responsive tests should still run.

10. **Validate.** Run the smallest useful checks after setup. If full browser installation or app startup is not possible, run static validation and explain exactly what remains.

---

## Preferred architecture to implement

Create or update the following architecture. Adapt paths only when the repository already has a strong convention.

```text
AGENTS.md
.agents/
  skills/
    playwright-e2e-agent/
      SKILL.md
      scripts/
        e2e-health.sh                  # optional but useful; make executable when created
.codex/
  playwright-mcp.example.toml          # optional MCP snippet, not active unless user chooses
  playwright-mcp.md                    # how to enable MCP/browser extension safely
.env.e2e.example
playwright.config.ts                   # or e2e/playwright.config.ts for isolated setup
e2e/
  README.md
  routes.ts
  fixtures.ts
  auth/
    README.md
    auth.config.ts
    auth.setup.ts
    manual-auth.setup.ts
    session-storage.ts
    token-auth.ts
  tests/
    smoke.spec.ts
    responsive.spec.ts
    authenticated.smoke.spec.ts
    visual.spec.ts                     # opt-in/tagged; do not make visual baselines block default CI
    accessibility.spec.ts              # add only if @axe-core/playwright is installed or you add it
  utils/
    env.ts
    routeDiscovery.ts
    uiDiagnostics.ts
    networkDiagnostics.ts
    locatorHints.ts
    testArtifacts.ts
  reports/
    .gitkeep
scripts/
  setup-playwright-agent.mjs           # idempotent setup/updater script when practical
```

If the repository already has Playwright directories, merge these ideas into the existing structure instead of duplicating.

---

## Step 1 — Discover and decide

Produce a short internal plan, then implement it. Do not ask questions unless a missing detail blocks all progress. Use safe defaults and env overrides.

Detect:

- Package manager: pnpm, npm, yarn, bun.
- Dev server command and port:
  - Next.js/Remix/Nuxt often `dev` around 3000.
  - Vite/SvelteKit often 5173.
  - Angular often 4200.
  - Django/Rails/Laravel/etc. should default to externally supplied `E2E_BASE_URL` unless a safe command is obvious.
- Whether `@playwright/test` exists. If absent, add it as a dev dependency using the detected package manager.
- Whether `@axe-core/playwright` exists. Add it as a dev dependency if adding dev dependencies is acceptable in the repo; otherwise create the accessibility spec as documented opt-in only.
- Existing CI. Only add CI changes if there is an existing CI convention; otherwise document a workflow snippet.
- Existing `AGENTS.md`. Append a concise project-specific Playwright section rather than replacing useful existing guidance.

---

## Step 2 — Create an idempotent setup/updater script

When practical, create `scripts/setup-playwright-agent.mjs` that can be re-run safely. The script should:

- Detect package manager and Playwright config location.
- Ensure required directories exist.
- Create missing files from templates.
- Avoid overwriting files with user changes. Use one of:
  - only create if missing;
  - update clearly marked blocks;
  - write `.new` files and explain manual merge when conflict risk is high.
- Ensure `.gitignore` includes sensitive paths.
- Print next commands.

After creating it, run it once or perform equivalent direct file creation if the repo structure makes a script impractical.

---

## Step 3 — Package scripts

Add scripts to the appropriate `package.json`. Use the detected package manager in docs, but scripts themselves should be package-manager neutral.

Suggested scripts, adjusted for actual config path:

```json
{
  "e2e": "playwright test",
  "e2e:smoke": "playwright test e2e/tests/smoke.spec.ts --project=desktop-chromium",
  "e2e:responsive": "playwright test e2e/tests/responsive.spec.ts",
  "e2e:auth": "playwright test e2e/auth/auth.setup.ts --project=auth-setup",
  "e2e:auth:record": "playwright codegen ${E2E_BASE_URL:-http://127.0.0.1:3000} --save-storage=playwright/.auth/manual-user.json",
  "e2e:ui": "playwright test --ui",
  "e2e:headed": "playwright test --headed",
  "e2e:debug": "playwright test --debug",
  "e2e:report": "playwright show-report",
  "e2e:install": "playwright install --with-deps"
}
```

If shell variable syntax is not cross-platform enough for this repo, replace `e2e:auth:record` with a small Node script.

---

## Step 4 — Playwright config

Create or update `playwright.config.ts` with these properties, adapted to the repo.

Requirements:

- `testDir` should point at the E2E tests.
- `baseURL` must come from env first:
  - `E2E_BASE_URL`
  - `PLAYWRIGHT_BASE_URL`
  - `BASE_URL`
  - fallback to the detected local URL.
- Use `webServer` when a reliable local command is detected. Allow override via:
  - `E2E_WEB_SERVER_COMMAND`
  - `E2E_WEB_SERVER_URL`
  - `E2E_WEB_SERVER_TIMEOUT_MS`
- Use reporters useful for agents and CI:
  - local list reporter
  - HTML reporter
  - JSON report to `test-results/e2e-results.json`
  - JUnit only if existing CI expects it.
- Defaults:
  - `screenshot: 'only-on-failure'`
  - `trace: process.env.CI ? 'retain-on-failure' : 'on-first-retry'` or the closest supported mode in the installed Playwright version.
  - `video: process.env.PW_VIDEO ? 'retain-on-failure' : 'off'`
  - `testIdAttribute` should match existing app convention if detectable; otherwise use `data-testid`.
- Configure sensible timeouts without masking real flakiness.
- Configure projects:
  - `auth-setup`: runs `e2e/auth/*.setup.ts`.
  - `desktop-chromium`: default high-signal project.
  - `desktop-firefox`: smoke-level cross-browser project.
  - `desktop-webkit`: smoke-level cross-browser project.
  - `mobile-chrome`: Pixel or similar Playwright device.
  - `mobile-safari`: iPhone Playwright device.
  - `tablet`: iPad/tablet or explicit viewport.
  - `narrow`: explicit viewport such as 375x667 when a device preset is insufficient.
  - `unauthenticated`: storageState cleared, for login/public pages.
- Add `dependencies: ['auth-setup']` only to authenticated projects when auth mode is configured. Avoid forcing auth setup for public-only tests.

---

## Step 5 — Auth subsystem

Create a flexible auth layer that supports common real app auth without hard-coding one provider.

### Required auth modes

Implement config-driven modes in `e2e/auth/auth.config.ts` and document them in `e2e/auth/README.md`.

Supported `E2E_AUTH_MODE` values:

1. `none`
   - No auth. Public tests run. Auth tests skip.

2. `manual-storage`
   - Uses `playwright/.auth/manual-user.json` or `E2E_AUTH_STORAGE_STATE`.
   - Intended for OAuth/SSO/2FA where the tester performs login once via `e2e:auth:record`.
   - Never commit generated storage state.

3. `ui`
   - Logs in through the first-party UI using env vars.
   - Env examples:
     - `E2E_LOGIN_URL`
     - `E2E_USERNAME`
     - `E2E_PASSWORD`
     - `E2E_USERNAME_SELECTOR` / `E2E_PASSWORD_SELECTOR` / `E2E_SUBMIT_SELECTOR` as optional overrides.
   - Prefer labels/roles/placeholder locators before CSS selectors.
   - Wait for a post-login URL or stable authenticated marker from env.

4. `api`
   - Uses Playwright `request`/APIRequestContext to authenticate and saves storage state.
   - Env examples:
     - `E2E_AUTH_API_URL`
     - `E2E_AUTH_API_METHOD=POST`
     - `E2E_AUTH_API_BODY_JSON`
     - `E2E_AUTH_API_HEADERS_JSON`
     - `E2E_AUTH_EXPECT_COOKIE` or `E2E_AUTH_EXPECT_STATUS`
   - Save `request.storageState({ path })` when cookies/localStorage are established.

5. `token`
   - Injects tokens into localStorage/sessionStorage/cookies/headers using env-provided JSON.
   - Env examples:
     - `E2E_LOCAL_STORAGE_JSON` or `E2E_LOCAL_STORAGE_FILE`
     - `E2E_SESSION_STORAGE_JSON` or `E2E_SESSION_STORAGE_FILE`
     - `E2E_COOKIE_JSON` or `E2E_COOKIE_FILE`
     - `E2E_EXTRA_HTTP_HEADERS_JSON`
   - Use this for JWT/session-token apps where the app accepts seeded test tokens.

6. `session-storage`
   - Explicitly persists and restores sessionStorage because Playwright storageState does not persist it automatically.
   - Implement helper functions in `e2e/auth/session-storage.ts` using `context.addInitScript` or equivalent safe pattern.

7. `multi-role`
   - Supports roles configured via `E2E_ROLES_JSON`, such as:
     ```json
     [
       { "name": "admin", "mode": "manual-storage", "storageState": "playwright/.auth/admin.json" },
       { "name": "user", "mode": "api", "apiUrl": "http://localhost:3000/test/login" }
     ]
     ```
   - Produce role state files under `playwright/.auth/<role>.json`.
   - Provide fixture helpers for `adminPage`, `userPage`, or a generic `pageForRole(role)` when practical.

### Auth files

Implement:

- `e2e/auth/auth.config.ts`: parse and validate env, paths, roles, base URL, storage state path.
- `e2e/auth/auth.setup.ts`: creates auth state according to mode; skips clearly when mode is `none`.
- `e2e/auth/manual-auth.setup.ts`: headed/manual helper if codegen is not enough.
- `e2e/auth/session-storage.ts`: save/restore helpers.
- `e2e/auth/token-auth.ts`: cookie/localStorage/sessionStorage/header injection helpers.
- `e2e/auth/README.md`: exact instructions for OAuth/manual storage, API login, UI login, tokens, multi-role, and common troubleshooting.

### Auth safety

Update `.gitignore` with:

```gitignore
# Playwright auth state and artifacts
playwright/.auth/
e2e/.auth/
**/storage-state*.json
**/*auth*.json
!**/*.example.json
test-results/
playwright-report/
blob-report/
```

Do not ignore source files accidentally; keep examples tracked.

---

## Step 6 — Fixtures and diagnostics

Create `e2e/fixtures.ts` that exports `test` and `expect` and wraps Playwright with diagnostics.

It should:

- Attach console errors, page errors, failed requests, 4xx/5xx response summaries, current URL, viewport, route name, screenshot-on-failure, and UI diagnostics JSON/Markdown.
- Provide helpers:
  - `gotoRoute(route)`
  - `expectHealthyPage(options?)`
  - `expectNoHorizontalOverflow(options?)`
  - `captureDiagnostics(label?)`
  - `pageForRole(role)` if multi-role is configured.
- Keep diagnostics lightweight on success and rich on failure.

Create `e2e/utils/uiDiagnostics.ts` with these capabilities:

1. **Horizontal overflow scan**
   - Compare `document.documentElement.scrollWidth` to `clientWidth`.
   - Find elements whose bounding rect exceeds viewport/doc width.
   - Include selector-like path, tag, role/name when available, text snippet, rect, computed width/maxWidth/minWidth/display/position/overflow/white-space/flex/grid styles, and likely reason.
   - Ignore hidden/script/style/meta/template elements and allow an ignore selector list from env/config.

2. **Clipping/offscreen scan**
   - Detect fixed/sticky/absolute elements with negative left/right overflow or impossible width.
   - Detect common menu/dialog/dropdown clipping issues.

3. **Responsive anti-pattern suggestions**
   - For `width: 100vw` inside pages with scrollbars: suggest `width: 100%`, `max-width: 100%`, or container sizing.
   - For flex children overflowing: suggest `min-width: 0`, `flex-wrap`, or `overflow-wrap: anywhere`.
   - For grid overflow: suggest `minmax(0, 1fr)`, responsive columns, or reducing fixed track sizes.
   - For images/SVG/canvas/video: suggest `max-width: 100%; height: auto` or container constraints.
   - For long tokens/URLs: suggest `overflow-wrap: anywhere`.
   - For absolute/fixed elements: suggest checking `left/right/inset`, transforms, and viewport-specific rules.

4. **Artifacts**
   - Save `test-results/<test-slug>/ui-diagnostics.json` and `ui-diagnostics.md`.
   - Attach artifacts to Playwright `testInfo`.
   - Keep Markdown concise: top offenders, screenshots/traces location, and likely fixes.

Create `e2e/utils/networkDiagnostics.ts` to capture:

- failed requests
- status >= 400 responses, with allowlist patterns from env
- console errors and page errors
- optionally slow requests when enabled by env

---

## Step 7 — Routes

Create `e2e/routes.ts` with a route registry:

```ts
export type E2ERoute = {
  name: string;
  path: string;
  auth?: false | 'user' | 'admin' | string;
  smoke?: boolean;
  responsive?: boolean;
  visual?: boolean;
  waitFor?: { role?: string; name?: string | RegExp; text?: string | RegExp; testId?: string };
};

export const routes: E2ERoute[] = [
  { name: 'home', path: '/', auth: false, smoke: true, responsive: true }
];
```

Populate it with representative routes from the repo when detectable:

- Next.js app/pages router.
- Remix routes.
- React Router route definitions.
- Vue/Nuxt pages.
- SvelteKit routes.
- Angular routes.
- Rails/Django/Laravel route files if clear.
- Otherwise keep `/` and support `E2E_ROUTES=/,/login,/dashboard`.

Do not invent protected routes if not detectable; leave commented examples.

---

## Step 8 — Tests

Create tests that are generic but useful.

### `e2e/tests/smoke.spec.ts`

- Iterate `routes.filter(r => r.smoke !== false)`.
- Navigate to route.
- Assert page loaded with a stable user-visible signal where configured; otherwise assert not blank and no catastrophic error page.
- Run network/console health checks.
- Skip auth-required routes if auth is not configured.

### `e2e/tests/responsive.spec.ts`

- Iterate responsive routes.
- Run under mobile/tablet/narrow/desktop projects.
- Assert no horizontal overflow.
- Assert primary landmark/header/main content is visible where present.
- Detect clipped dialogs/menus only when they can be opened generically or from route config.
- Attach UI diagnostics when failing.

### `e2e/tests/authenticated.smoke.spec.ts`

- Run only when auth mode is configured.
- Verify authenticated route(s) do not redirect to login.
- Check a generic authenticated marker when configured.
- For multi-role, verify role-specific storage states load.

### `e2e/tests/visual.spec.ts`

- Tag as visual/opt-in, not default CI unless the repo already uses visual snapshots.
- Use screenshot assertions only for stable routes and document how to update baselines.
- Include a CSS mask/hide stylesheet for volatile elements when needed.

### `e2e/tests/accessibility.spec.ts`

- If `@axe-core/playwright` is available, run a basic axe scan for high-impact violations on representative routes.
- If not available, document how to enable it and skip the test cleanly.

---

## Step 9 — Playwright Test Agents for Codex

If the installed Playwright version supports it, run or add a script for:

```bash
npx playwright init-agents --loop=codex
```

Do not fail the whole setup if this command is unavailable. Document the result. These generated agent definitions should complement, not replace, the repo skill below.

---

## Step 10 — Codex repo skill

Create `.agents/skills/playwright-e2e-agent/SKILL.md`.

The skill must include frontmatter:

```md
---
name: playwright-e2e-agent
description: Use when testing or fixing web UI with Playwright, including auth/session storage/OAuth, mobile responsiveness, visual regressions, overflow/clipping, console/network errors, and E2E flake diagnosis.
---
```

Skill instructions should tell future Codex runs to:

1. Start by reading `e2e/README.md`, `e2e/auth/README.md`, `playwright.config.*`, `e2e/routes.ts`, and relevant app route/component files.
2. For UI bugs, run the narrowest relevant Playwright command first, usually:
   - `npm run e2e:smoke -- --project=desktop-chromium`
   - `npm run e2e:responsive -- --project=mobile-chrome`
   - or the package-manager equivalent.
3. Inspect Playwright HTML/JSON reports, traces, screenshots, `ui-diagnostics.md`, console errors, page errors, and failed network requests before changing code.
4. Patch the smallest likely app/CSS/component issue, not the test, unless the test is clearly wrong.
5. Prefer semantic locators and web-first assertions.
6. Use auth modes safely. Never request or write real secrets. For SSO/2FA/OAuth, prefer manual storage state or test IdP/API login.
7. Rerun the targeted failing project after each fix.
8. Only widen to all projects when the targeted fix passes.
9. Update route registry and docs when adding coverage.
10. Keep traces/screenshots out of git.

Optionally include `scripts/e2e-health.sh` that runs a concise local health check and prints reports.

---

## Step 11 — AGENTS.md

Create or append a concise Playwright/Codex section to `AGENTS.md`.

Include:

- Where the E2E docs live.
- Package-manager-specific commands.
- Auth artifact safety rules.
- Instruction to use `$playwright-e2e-agent` or the repo skill for UI/auth/responsive tasks.
- A short “fix loop”:
  1. run targeted Playwright project;
  2. inspect trace + UI diagnostics;
  3. patch minimal UI/code issue;
  4. rerun targeted test;
  5. then run broader suite.

Keep it short; detailed instructions belong in the skill and E2E docs.

---

## Step 12 — Optional Playwright MCP setup docs

Create `.codex/playwright-mcp.example.toml` and `.codex/playwright-mcp.md` explaining optional MCP use. Do not enable MCP silently unless the project already has `.codex/config.toml` and the project is trusted.

Example TOML:

```toml
[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest"]
```

Also document optional modes:

- `--headless` for headless exploration.
- `--isolated --storage-state=playwright/.auth/manual-user.json` for deterministic auth state.
- `--extension` for reusing existing Chrome/Edge sessions in SSO/2FA workflows.
- `--cdp-endpoint=http://localhost:9222` for attaching to a controlled Chromium/Electron browser.

Warn that arbitrary code execution tools are powerful and should only be enabled for trusted projects/clients.

---

## Step 13 — Docs

Create `e2e/README.md` with:

- Quick start.
- How to install browsers.
- How to run smoke, responsive, auth, headed, debug, UI mode, report, trace viewer.
- How routes are configured.
- How diagnostics work.
- How to interpret overflow reports and likely CSS fixes.
- How to add a test for a new user flow.
- How to run on CI.

Create `e2e/auth/README.md` with:

- Auth modes table.
- Exact env variables.
- OAuth/manual storage-state recording steps.
- UI login steps.
- API login steps.
- Token/cookie/sessionStorage examples using fake values only.
- Multi-role examples.
- Security warnings.

Create `.env.e2e.example` with fake values and comments.

---

## Step 14 — CI

If existing GitHub Actions or another CI is present, add or update a Playwright job only if it fits the repo conventions.

Requirements when adding CI:

- Install dependencies using the repo package manager.
- Install Playwright browsers with dependencies.
- Run smoke/responsive default projects.
- Upload `playwright-report/`, `test-results/`, and JSON/JUnit artifacts on failure or cancellation.
- Do not require real auth secrets by default. Auth tests should be opt-in through CI secrets.

If no CI convention exists, add docs/snippet only.

---

## Step 15 — Validation

After implementation, run the most relevant safe commands:

1. Package manager install if dependencies changed.
2. Playwright config validation, e.g. `npx playwright test --list`.
3. Typecheck/lint for created TS files if available.
4. A public smoke test if a local server can start safely.
5. Responsive test against `/` if possible.

If a command cannot run because browsers/server/env are unavailable, state that honestly and provide the exact command for the user.

---

## Final response format

When done, respond with:

1. **What I changed** — concise file list grouped by purpose.
2. **How to use it** — exact commands with the repo’s package manager.
3. **Auth setup choices** — which modes are now supported and how to enable the most likely one for this repo.
4. **Responsive/UI diagnostics workflow** — the fastest command to reproduce and fix overflows/UI bugs.
5. **Validation run** — commands run and results.
6. **Follow-up notes** — only blockers or manual steps, especially browser install, env variables, OAuth manual storage capture, or CI secrets.

Do not include secrets. Do not claim a test passed unless it was actually run and passed.
