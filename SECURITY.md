# Security model

- Codex Kit never copies a whole Codex home and never stores auth, OAuth, sessions, histories, caches, or raw configuration.
- Managed `AGENTS.md` blocks have bounded markers; incomplete or duplicate blocks fail without writing.
- Plans are previewed before application. File changes are journaled with hashes and backups under transaction receipts.
- Plugin and MCP changes are external actions: they are verified, recorded, and only best-effort reversible.
- Catalog entries are validated and limited to built-in adapters. Arbitrary executable definitions and remote catalogs are rejected.
- Skill imports reject symlinks/junctions, special files, sensitive names, VCS data, escaping paths, and files over 1 MiB.
- Enrichment sends only a minimized inventory, runs an ephemeral read-only Codex session, validates JSON, and never applies recommendations automatically.
- No `shell: true`, `curl | sh`, `irm | iex`, automatic execution-policy changes, elevation, or automatic Graphify builds/hooks are used.
- Windows sandbox and PowerShell policy are inspected by `doctor` but never changed by Codex Kit.

Verify the SHA-256 checksum of a private release asset before installing it. Keep `--allow-network` and `--yes` explicit in automation.
