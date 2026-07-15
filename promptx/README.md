# promptx

promptx turns rough development requests into structured, repo-aware Codex prompts.

It inspects repository metadata, likely source and test files, docs, package/tooling signals, and available verification commands. It favors paths and commands over broad prose, and it avoids reading or printing secret files.

## Run Setup

```bash
node scripts/setup-codex-prompt-enhancer.mjs
```

The setup is idempotent. It creates the CLI, templates, eval examples, a local Codex Skill, a concise `AGENTS.md` section, and a generated repo profile cache.

## Enhance a Prompt

```bash
node tools/promptx/promptx.mjs "Add invoice CSV export"
```

Optional direct Codex usage:

```bash
codex "$(node tools/promptx/promptx.mjs 'Add invoice CSV export')"
```

## Profile Commands

```bash
node tools/promptx/promptx.mjs --profile
node tools/promptx/promptx.mjs --refresh-profile
```

`--profile` prints the cached or generated repo profile. `--refresh-profile` regenerates `.promptx/repo_profile.json`.

## Skill Usage

The local skill lives at:

```text
.agents/skills/prompt-enhancer/SKILL.md
```

If `.agents` is mounted read-only, setup writes the same skill content to:

```text
tools/promptx/skills/prompt-enhancer/SKILL.md
```

Invoke it when you want Codex to enhance a rough task before implementation, for example: "Use the prompt-enhancer skill to turn this into a repo-aware prompt: Fix login redirect bug."

## Templates

Editable prompt templates live in:

```text
tools/promptx/templates/
```

The CLI currently builds prompts in code, but these templates are installed for future customization and evaluation.

## Safety Notes

- promptx ignores `.env`, private key, certificate, lock, build, dependency, and cache paths.
- It redacts common secret-looking values.
- It prefers file paths and metadata over source snippets.
- Do not paste real credentials into prompts.

## Examples

```bash
node tools/promptx/promptx.mjs "Fix login redirect bug"
node tools/promptx/promptx.mjs "Refactor user service without changing behavior"
node tools/promptx/promptx.mjs "Audit webhook signature verification security"
```
