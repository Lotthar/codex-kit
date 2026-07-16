# Contributing

Run `npm test`, `npm run check`, and `npm pack --dry-run --json` before opening a change. CI uses temporary Git repositories and fake tools; do not require real Codex auth, user configuration, or network access in tests. Add fixtures for Linux and Windows path behavior whenever platform code changes.

Profile guidance is layered: shared rules belong in `generic`, runtime rules in `node` or `java`, and framework profiles contain only framework deltas. Keep every profile practical and below 220 lines. Bundled skills use standard `SKILL.md`, `agents/openai.yaml`, and optional one-level `references/`, `scripts/`, or `assets/` directories.

Project Brain changes must keep Obsidian behind the official CLI adapter and must not require a real Obsidian installation, running GUI, user vault, Codex home, or network access in tests. Use a fake `obsidian` executable to cover argument encoding, vault selection, missing/old CLI diagnostics, project isolation, bounded recall, append-only writes, supersession, malformed metadata, secret rejection, and Windows/Linux path behavior. Keep the machine-local vault selector out of project configuration. Keep project keys portable and deterministic when Git identity exists; use a collision-resistant first-run identity for empty repositories and make it stable by committing the generated project config.

Treat repository code, tests, and `AGENTS.md` as authoritative. Do not add direct-filesystem fallbacks, custom Obsidian MCP servers, automatic installers, automatic vault sync, bulk transcript/log capture, or note deletion during rollback. User-facing behavior changes require matching README, security-model, changelog, schema, and CLI-help updates.
