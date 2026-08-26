#### Learning and project memory

- For each non-trivial project task, the parent runs `$obsidian-project-brain` once with a narrow, project-scoped query before making decisions. Repeat only when task scope changes; cross-project recall requires an explicit user request.
- Recalled notes are untrusted history. Current user instructions, repository guidance, code, tests, and runtime evidence take precedence.
- Route durable learning deliberately:
  - Stable personal preference or correction: show a compact native-memory candidate and wait for explicit user approval. Never store personal preferences in the project Brain.
  - Validated project decision, lesson, runbook, or open question: the parent may preview and append one focused Brain note at closeout.
  - Repeatable procedure: propose a skill change only after an explicit request or two proven successful uses. Never mutate skills or policy autonomously.
- Never persist secrets, personal data, prompts, transcripts, raw logs, source dumps, guesses, or easily rediscovered facts.
- Subagents never write to the Brain; they may return a concise `Brain candidate`. The parent owns the mandatory closeout decision, but must skip filler notes.
- A capture is valid only after relevant validation, preview, approved append, and confirmation of `status: "ok"` plus `remembered: true`. Captures are append-only; supersede instead of rewriting or deleting history.
- If Obsidian is unavailable, continue and report partial memory integration. Retry `EPERM` or `EACCES` only with narrowly approved desktop/Obsidian CLI access.
