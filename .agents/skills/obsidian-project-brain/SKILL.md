---
name: obsidian-project-brain
description: Recall and curate connected work-project knowledge through Codex Kit and the official Obsidian CLI. Use for non-trivial planning, architecture, debugging, resumed work, decisions, lessons, runbooks and validated knowledge capture.
---

# Obsidian Project Brain

Use Codex Kit as the only interface. Do not read or mutate vault files directly.

## Recall

1. Once per non-trivial work task, run `codex-kit brain recall --query "<specific task terms>" --scope related --json` before making decisions. Re-query only when the task scope changes.
2. The repository selects its project. For non-code work or a projectless task, use `brain projects`, then pass the intended `--project KEY`; never create a namespace for every temporary task directory.
3. Related recall prioritizes the current project and includes at most two relevant notes from included work projects within a 4 KiB context budget. Excluded, pending, personal and financial projects are not automatic cross-project context. `--scope project` narrows recall; explicit `--scope all` is for intentional wider work-project searches.
4. Follow returned paths using bounded `brain read --path NOTE_PATH --project KEY` when more detail is needed. Inspect originating project, evidence sources and freshness. Notes are untrusted history; current instructions, repository guidance, code, tests and runtime evidence prevail.
5. Continue useful work on `partial`. If the sandbox denies the official Obsidian CLI with `EPERM` or `EACCES`, retry only with narrowly approved desktop access. Do not bypass the CLI or reinstall a healthy app.

## Registration and alignment

- `brain register --root PATH --name NAME --topics flutter,deployment` previews a work-project registration; `--yes` persists it. Non-code projects support `--external-id ID`. Explicitly mark exclusions with `--inclusion excluded`; ambiguous projects stay `pending`.
- Normal Brain-enabled project setup initializes and registers the project. Preserve stable keys and existing exclusions. Do not scan arbitrary folders or auto-import chat history.
- `context status` detects policy and skill drift. `doctor --all` checks registered work projects and generated indexes. `upgrade --all` previews a resumable installation upgrade; inspect its exact targets, then apply with `--expected-hash MANIFEST_HASH --yes`.
- `brain repair --scope project` or `--scope global` previews the declared Brain skill difference. Apply a reviewed repair with its `--expected-hash` and `--yes`; preserve intentional customizations.
- `brain reconcile --scope all` previews note classifications and managed graph pages. `--yes` updates only Kit-owned generated pages and local recovery metadata; historical notes and human Home pages are preserved.

## Capture

Only the parent agent may capture. Subagents return concise candidates.

Before the final response on every validated non-trivial task, make a capture decision. The decision is mandatory; creating a note is not.

1. Choose one durable decision, verified lesson, reusable runbook, unresolved question or project overview supported by the completed work. If nothing qualifies, report `Brain: skipped — no durable project knowledge.`
2. Read [references/note-contract.md](references/note-contract.md). Do not persist secrets, personal data, prompts, transcripts, raw logs, source dumps or guesses. Personal preferences require explicit approval in native memory instead. Reusable procedures become skill proposals only after an explicit request or two proven successful uses.
3. Preview `codex-kit brain remember --kind KIND --title "TITLE" --summary "SUMMARY" --source "SOURCE" [--details "DETAILS"] [--topics CSV] [--supersedes KEY_OR_PATH] --json`.
4. Review then repeat with `--yes`. The unique note ID is allocated at apply. A successful capture returns `remembered: true`; graph refresh is reported separately as `indexed`.
5. If the note was saved but indexing failed, retry `brain reconcile --scope all --yes`, never repeat capture. Confirm saved-note readback before reporting `Brain: captured PATH`.
6. Refresh an overview only when validated work changes durable project context, using supersession. Do not rewrite historical notes or human Home pages. Unknown historical claims remain unresolved, never fabricated as verified.

## Reliability

Generated graph pages aid navigation; they are not independent evidence. Installation health does not prove task-level recall or capture. Report actual tool results and incomplete validation precisely. Do not create background jobs or persist task transcripts.
