# Security model

Codex Kit is declarative and conservative:

- No `curl | sh`, shell interpolation, or bypass flags.
- Commands run as argument arrays with `shell: false`.
- Global setup refuses unapproved components and does not synchronize a raw Codex home directory.
- Export only inventories allowlisted portable files (`AGENTS.md` and skill names); it excludes `auth.json`, tokens, OAuth, cache, history, sessions, trust data, and raw `config.toml`.
- Enrichment uses `codex exec --ephemeral --sandbox read-only --ignore-user-config --ignore-rules` and validates a small JSON proposal schema.
- Each changed file has a timestamped backup receipt under `.codex-kit/backups` before it is replaced.

Review a `--dry-run` output before adding `--yes`. Network-capable component installation additionally requires `--allow-network`.
