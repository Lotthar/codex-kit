# Note contract

## Kinds

- `decision`: chosen approach, constraints and reasons.
- `lesson`: verified failure mode, invariant or reusable technique.
- `runbook`: concise repeatable operational procedure.
- `question`: unresolved issue, explicitly not an established fact.
- `overview`: current project purpose, architecture or workflow, durable constraints and source references. Supersede an older overview rather than rewriting it.

Titles and summaries must stand alone. Include actual evidence sources and distinguish verified facts from hypotheses. Keep details concise and link to source-of-truth files instead of copying them. A Git commit is provenance, not universal proof of freshness.

Codex Kit writes flat metadata for project, kind, key, active status, creation time, verified commit, sources, supersedes, author, and optional topics. Notes are uniquely named append-only Markdown under `Projects/<key>/<Kind>/`. New notes link to their project Home and declared topic pages. Historical notes and human Home pages remain unchanged.

Use `supersedes` for an evidence-backed correction, including a same-project legacy note path. Unknown or missing sources stay unverified. Unresolved questions and ambiguous supersession must not be presented as settled knowledge.

Generated catalog, project and topic pages live under `CodexKit/Brain/`, outside the original note namespace. They contain navigation/classification data and are managed by reconciliation with ownership hashes. They are not independent evidence. Receipts contain safe metadata and hashes, never original note bodies.

Project namespaces and inclusion settings are retrieval boundaries, not operating-system access controls. Personal/financial projects are excluded from automatic work context. Never put credentials, personal data or private logs in the Brain.
