# Note contract

## Kinds and intent

- `decision`: a chosen approach, constraints, and the reason alternatives were rejected.
- `lesson`: a verified failure mode, invariant, or technique likely to recur.
- `runbook`: a short repeatable operational or diagnostic procedure.
- `question`: an unresolved issue that should remain visible to future work.

## Required quality

- Make the title specific and the summary independently useful.
- Record only facts supported by current evidence.
- Include a Git commit or another stable source when available.
- Separate verified facts from hypotheses.
- Keep details concise and durable; link to source-of-truth files instead of copying them.
- Use `supersedes` when new evidence replaces an older note.

Codex Kit writes flat YAML metadata for `codex_brain`, `project`, `kind`, `key`, `status`, `created`, `verified_commit`, `sources`, `supersedes`, and `author`. It creates a unique append-only Markdown note under `Projects/<projectKey>/<Kind>/` and returns a redacted receipt without the body.

A dry-run reports the destination pattern. The mutating run allocates the final timestamp and unique ID so two captures can never target the same note.

The project namespace is a default retrieval boundary, not an operating-system security boundary. The user controls the whole vault. Never place credentials, tokens, secrets, private logs, or sensitive personal information in it.
