# Contributing

Run `npm test`, `npm run check`, and `npm pack --dry-run --json` before opening a change. CI uses temporary Git repositories and fake tools; do not require real Codex auth, user configuration, or network access in tests. Add fixtures for Linux and Windows path behavior whenever platform code changes.

Profile guidance is layered: shared rules belong in `generic`, runtime rules in `node` or `java`, and framework profiles contain only framework deltas. Keep every profile practical and below 220 lines. Bundled skills use standard `SKILL.md`, `agents/openai.yaml`, and optional one-level `references/`, `scripts/`, or `assets/` directories.
