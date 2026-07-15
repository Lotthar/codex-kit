# Codex Kit

Codex Kit makes a repeatable, reviewable Codex baseline for Linux developer machines and individual projects. It is intentionally Node-standard-library-only, never copies a whole `~/.codex` directory, and defaults to previewing a plan before changes.

## Quick start

```bash
npm test
node bin/codex-kit.mjs setup --preset developer --dry-run
node bin/codex-kit.mjs project init --dry-run
node bin/codex-kit.mjs project init --yes
```

Install it globally from a checked-out copy with `npm link`, or run `node /path/to/codex-kit/bin/codex-kit.mjs`.

## Commands

| Command | Purpose |
| --- | --- |
| `setup` / `apply` | Preview or apply a portable global Codex preset. |
| `project init` / `project refresh` | Detect a project and manage a bounded block in its `AGENTS.md`. |
| `add` / `remove` | Change enabled project components. |
| `skill import NAME --source PATH` | Preview or import one portable, non-sensitive skill into `.agents/skills` with a provenance receipt. |
| `diff` | Show the desired managed project block without writing it. |
| `doctor` | Check Node/Codex availability and optionally return Codex diagnostics. |
| `update` | Report pinned-component update candidates; no network access by default. |
| `rollback` | Restore the latest Codex Kit backup. |
| `export` | Export a safe inventory of portable local artifacts; secrets and raw config are excluded. |

All mutating commands require `--yes`; otherwise they preview. `--dry-run` always prevents writes. `--json` returns machine-readable output.

To reuse another personal skill in a project, commit its portable source in this repository or import it explicitly:

```bash
codex-kit skill import my-skill --source ~/.codex/skills --yes
```

The importer requires a `SKILL.md`, refuses suspicious credential files, never overwrites a project skill, and records its source in `.codex-kit/imports.json`.

## Safe defaults

- Presets are pinned in `catalog/codex-kit.lock.json`.
- Global setup uses the Codex CLI for plugins/MCPs and only edits allowlisted TOML values.
- Project setup detects `Node`, `Nuxt`, `Flutter`, `Quarkus/Java`, or falls back to `generic`.
- Graphify is recommended for a monorepo, three top-level packages/services, or at least 300 tracked source files. Installing, building a graph, and hooks are separate explicit choices.
- Optional enrichment invokes `codex exec` in a temporary directory with an ephemeral, read-only, user-config-free session. Its JSON output is proposed, never applied automatically.

## Legacy assets

Existing `setup-graphify-codex.mjs`, `promptx/`, and `continuous-clean-code-refactor/` are retained. Codex Kit records them as optional components; it does not run their older setup scripts implicitly because those scripts may install packages or mutate broader project state.

## Repository and security policy

Commit portable policies, catalog definitions, and custom skills that contain no private code or credentials. Do not commit `auth.json`, OAuth data, history/session/cache files, raw Codex configuration, private source, or generated trust data. See [SECURITY.md](SECURITY.md).
