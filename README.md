# Codex Kit

Codex Kit creates reviewable, repeatable Codex setup plans for personal Codex homes and Git projects. It previews changes by default, records file transactions, and supports Linux plus native Windows 11.

## Platform support

| Platform | Support |
| --- | --- |
| Linux | Tier one |
| Windows 11, PowerShell and Command Prompt | Tier one |
| WSL2 | Linux behavior |
| Windows 10 and macOS | Best effort |

Node 20+, Git, and Codex are required. GitHub CLI is required only to download private releases; Python is optional for Graphify.

## Install a private release

Download the release tarball with authenticated GitHub CLI, then install it with npm. The same commands work in Bash and PowerShell:

```text
gh release download v0.2.0-beta.1 -R Lotthar/codex-kit --pattern "codex-kit-*.tgz"
npm install -g codex-kit-*.tgz
codex-kit wizard
```

For development from a clone:

```text
npm install
npm link
codex-kit doctor
```

## Commands

| Command | Purpose |
| --- | --- |
| `wizard` | Step-by-step preflight, selection, preview, and confirmation. |
| `setup` | Plan or apply a global preset. Network components require `--allow-network`. |
| `project init`, `refresh`, `plan`, `apply`, `status` | Manage a Git project’s desired Codex setup. |
| `component add/remove/list` | Manage selected project components. `add/remove` remain aliases. |
| `skill import` | Copy one portable, validated local skill with provenance. |
| `diff`, `history`, `rollback` | Review and recover managed project changes. |
| `doctor`, `update --check`, `export` | Inspect prerequisites, pinned update availability, and portable artifacts. |

Mutations require `--yes`; `--dry-run` always wins; `--json` never prompts. Noninteractive environments should use explicit commands and flags.

## Profiles

Profiles are detected from files and manifests without running project code. They compose from runtime to framework:

- `node + nuxt` for Nuxt
- `node + angular` for Angular CLI or Nx Angular projects
- `java + spring` for Spring Boot projects
- `java + quarkus` for Quarkus projects
- `flutter` or `generic` where appropriate

Angular detection uses `angular.json` or `@angular/core`. Java projects use Maven/Gradle markers; Spring and Quarkus require their specific dependencies/plugins. Project config can include or exclude profiles explicitly.

## Project state and recovery

`.codex-kit/config.json` is the commit-friendly desired configuration. Runtime state, locks, backups, and transaction receipts remain ignored. `diff` previews the resulting managed block, `history` lists transactions, and `rollback --transaction ID --yes` restores tracked file changes. Plugin and MCP changes are best-effort reversible and are recorded clearly.

Graphify installation, graph builds, hooks, and Codex enrichment always require explicit consent. PromptX and clean-code assets are never run implicitly.

See [SECURITY.md](SECURITY.md), [CHANGELOG.md](CHANGELOG.md), and [CONTRIBUTING.md](CONTRIBUTING.md).
