# Diagnostics and coverage patterns

## Failure diagnostics

Capture enough evidence to reproduce a failure without making successful runs expensive:

- trace on first retry or failure;
- screenshot on failure;
- video retained on failure when motion or timing matters;
- page errors and console errors, with intentional noise allowlisted narrowly;
- failed requests and unexpected non-success responses, excluding known telemetry or canceled navigation;
- current URL, project, viewport, role, and test step annotations.

Never log request headers, cookies, storage state, credentials, or sensitive response bodies. Attach safe summaries and artifact paths.

## Stable tests

- Prefer web-first assertions and locator auto-waiting.
- Avoid fixed sleeps. Wait for user-visible state or a specific response only when it is the real contract.
- Use role, accessible name, label, placeholder, text, or explicit test IDs.
- Keep tests independent and safe to retry.
- Seed deterministic data through existing fixtures or APIs when permitted.
- Assert outcomes, not internal implementation details.

## Responsive checks

Test supported breakpoints and critical layouts rather than arbitrary device lists. Useful checks include:

- no unexpected document-level horizontal overflow;
- navigation remains reachable and operable;
- dialogs, menus, tables, forms, and fixed controls stay within the viewport;
- text does not become unreadable or clipped;
- orientation and narrow-height behavior where relevant.

## Accessibility smoke

Start with native Playwright assertions for names, roles, focus, keyboard use, and visible error association. Add an accessibility scanning dependency only when approved or already present. Treat automated scans as a supplement to keyboard and semantic checks.

## Visual tests

Add screenshots only for stable, high-value surfaces. Freeze animations, clocks, random data, and network responses where appropriate. Keep baseline ownership explicit and review diffs rather than blindly updating snapshots.

## CI

- Use the repository's pinned runtime and package manager.
- Install dependencies reproducibly from the lockfile.
- Install only required browser engines and system dependencies.
- Start the application once per job unless isolation requires otherwise.
- Upload reports, traces, screenshots, and videos on failure with bounded retention.
- Shard only after runtime justifies the complexity.
- Keep test credentials in CI secret storage and reference variable names only.
