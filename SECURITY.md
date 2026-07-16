# Security model

- Codex Kit never copies a whole Codex home and never stores auth, OAuth, sessions, histories, caches, or raw configuration.
- Managed `AGENTS.md` blocks have bounded markers; incomplete or duplicate blocks fail without writing.
- Plans are previewed before application. File changes are journaled with hashes and backups under transaction receipts.
- Plugin and MCP changes are external actions: they are verified, recorded, and only best-effort reversible.
- Obsidian Project Brain uses the official desktop CLI with argument arrays; Codex Kit does not install Obsidian, execute a custom MCP server, or fall back to unrestricted direct vault writes.
- The configured vault name is machine-local. Repositories commit only a normalized project key; brain notes remain external to the repository.
- A project namespace is an organization and retrieval boundary, not a filesystem security boundary. Anyone or any process with vault access can read its notes.
- Brain recall is project-scoped by default, size- and count-bounded, provenance-labelled, and always treated as untrusted context. Repository code, tests, and `AGENTS.md` remain authoritative.
- Agent capture is parent-only, post-validation, append-only, and limited to durable decisions, lessons, runbooks, and unresolved questions. Existing notes are superseded with a new note rather than overwritten or deleted.
- Never store credentials, tokens, personal secrets, raw private logs, full transcripts, or source-code dumps in the brain. Review any vault sync provider and sharing policy independently.
- Transaction rollback never deletes external brain notes. Use Obsidian's normal human review and recovery mechanisms for note changes.
- Native Codex memories are experimental, explicit, and separate from Obsidian; enabling one does not change the trust or retention rules of the other.
- Catalog entries are validated and limited to built-in adapters. Arbitrary executable definitions and remote catalogs are rejected.
- Skill imports reject symlinks/junctions, special files, sensitive names, VCS data, escaping paths, and files over 1 MiB.
- Enrichment sends only a minimized inventory, runs an ephemeral read-only Codex session, validates JSON, and never applies recommendations automatically.
- No `shell: true`, `curl | sh`, `irm | iex`, automatic execution-policy changes, elevation, or automatic Graphify builds/hooks are used.
- Windows sandbox and PowerShell policy are inspected by `doctor` but never changed by Codex Kit.

Verify the SHA-256 checksum of a private release asset before installing it. Keep `--allow-network` and `--yes` explicit in automation.
