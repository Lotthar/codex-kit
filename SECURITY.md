# Security model

- Codex Kit never copies a whole Codex home and never stores auth, OAuth, sessions, histories, caches, or raw configuration.
- Managed `AGENTS.md` blocks have bounded markers; incomplete or duplicate blocks fail without writing.
- Plans are previewed before application. File changes are journaled with hashes and backups under transaction receipts.
- Plugin and MCP changes are external actions: they are verified, recorded, and only best-effort reversible.
- REA is an explicit global opt-in. Its setup previews offline; executable downloads require both `--allow-network` and `--yes`. Private, pinned Node/JDK/Ghidra/JADX artifacts are checksum-verified before safe extraction; ordinary MCP startup performs no package resolution.
- REA's exact MCP block, policy, skill, and toolchain are owned by dedicated hashes and receipts. Setup/removal preserve other config bytes and customized or unowned assets. Removal retains investigation evidence/caches and never calls upstream's multi-client uninstall. File readiness does not prove a live Codex MCP connection.
- REA target content is untrusted data. Runtime/device/browser operations remain bounded by the requested target and authorized actions. Local analysis results sent to Codex enter model context; use focused results, separate debugging browser profiles, and credential-free captures.
- Obsidian Project Brain uses the official desktop CLI with argument arrays; Codex Kit does not install Obsidian, execute a custom MCP server, or fall back to unrestricted direct vault writes.
- The configured vault name is machine-local. Repositories commit only a normalized project key; brain notes remain external to the repository.
- A project namespace is an organization and retrieval boundary, not a filesystem security boundary. Anyone or any process with vault access can read its notes.
- Brain recall is size- and count-bounded, provenance-labelled, and always treated as untrusted context. Related-project retrieval is limited to registry entries explicitly marked `included`; `project` and `all` scopes remain explicit. Repository code, tests, and `AGENTS.md` remain authoritative.
- Agent capture is parent-only, post-validation, append-only, and limited to durable decisions, lessons, runbooks, and unresolved questions. Existing notes are superseded with a new note rather than overwritten or deleted.
- Never store credentials, tokens, personal secrets, raw private logs, full transcripts, or source-code dumps in the brain. Review any vault sync provider and sharing policy independently.
- Transaction rollback never deletes external brain notes. Use Obsidian's normal human review and recovery mechanisms for note changes.
- Registry metadata is machine-local and validates keys, paths, topics, inclusion state, control characters, and secret-like values. It does not probe or copy project contents.
- Reconciliation writes only marked `CodexKit/Brain` generated pages after a complete safe scan, preserves original notes, and reports conflicts instead of replacing human edits. Repair of a divergent managed Brain skill requires the previewed hash.
- Registered-project upgrades are per-target and resumable. They are not globally atomic; receipts identify completed and pending targets.
- Native Codex memories are experimental, explicit, and separate from Obsidian; enabling one does not change the trust or retention rules of the other.
- Catalog entries are validated and limited to built-in adapters. Arbitrary executable definitions and remote catalogs are rejected.
- Skill imports reject symlinks/junctions, special files, sensitive names, VCS data, escaping paths, and files over 1 MiB.
- Enrichment sends only a minimized inventory, runs an ephemeral read-only Codex session, validates JSON, and never applies recommendations automatically.
- No `shell: true`, `curl | sh`, `irm | iex`, automatic execution-policy changes, elevation, or automatic Graphify builds/hooks are used.
- Windows sandbox and PowerShell policy are inspected by `doctor` but never changed by Codex Kit.

Verify the SHA-256 checksum of a private release asset before installing it. Keep `--allow-network` and `--yes` explicit in automation.
