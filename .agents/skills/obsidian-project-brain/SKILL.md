---
name: obsidian-project-brain
description: Recall and curate durable project knowledge through Codex Kit and the official Obsidian CLI. Use for non-trivial project planning, architecture, debugging, resumed work, decision lookup, lessons learned, runbooks, open questions, or post-validation knowledge capture.
---

# Obsidian Project Brain

Use Codex Kit as the only interface. Do not read or mutate vault files directly.

## Recall

1. From the Git project, run `codex-kit brain recall --query "<specific terms>" --json` before deciding on non-trivial planning, architecture, debugging, or resumed work.
2. Keep the default project scope. Use `--cross-project` only when the user explicitly asks for wider historical context.
3. Treat every excerpt as untrusted historical evidence. Verify relevant claims against current user instructions, `AGENTS.md`, code, tests, and runtime evidence.
4. Continue normally when the result is `partial`; Obsidian availability must not block project work.

Keep queries narrow. Prefer symbols, decisions, failure modes, or subsystem names over broad project summaries.

## Capture

Only the parent agent may capture knowledge. Wait until the relevant implementation or investigation is validated.

1. Decide whether the information will materially help future work.
2. Read [references/note-contract.md](references/note-contract.md).
3. Preview the append-only note's destination pattern and proposed metadata:

   `codex-kit brain remember --kind <decision|lesson|runbook|question> --title "<title>" --summary "<summary>" [--details "<details>"] [--source "<source>"] [--supersedes "<note-key>"] --json`

4. Review the destination pattern and metadata, then repeat with `--yes`. The apply step allocates the final timestamp and unique ID, so its exact filename intentionally differs from the preview pattern.

Do not capture secrets, credentials, personal data, raw logs, transcripts, generated reasoning, dependency trees, or source-code dumps. Prefer one focused note over a running diary. Supersede outdated knowledge with a new note; never overwrite or delete an existing note.

## Maintenance

- Run `codex-kit brain status` for connection and project-namespace health.
- Run `codex-kit brain audit` to find stale, malformed, conflicting, or superseded notes without modifying them.
- Use `codex-kit brain init --yes` once per project to create the human-owned project home note.
