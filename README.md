# Codex Kit

Codex Kit turns an existing Git project into a reproducible Codex workspace. It detects the stack, composes practical `AGENTS.md` guidance, installs project-local skills, can connect Codex to a personal Obsidian project brain, recommends the global integrations that help most developers, previews every change, and records rollback receipts.

## What it sets up

| Scope | Managed setup |
| --- | --- |
| Global Codex home | Bounded policy block, Ponytail plugin, Ruflo MCP, optional Obsidian Project Brain skill |
| Git project | Detected profiles, bounded `AGENTS.md` block, workflow/quality skills, PromptX, optional Graphify adapter, stable brain project key |
| Personal Obsidian vault | External, project-namespaced decisions, lessons, runbooks, and open questions |

Ponytail, Ruflo, and the Project Brain policy are global because they shape how Codex works on a machine. Profiles, project skills, PromptX, Graphify configuration, and the brain project key stay inside the project so the development workflow travels with the repository. The vault and its contents remain outside the repository and under your control.

## Personal Project Brain: recommended setup

The `personal` preset makes a dedicated Obsidian vault the durable, human-readable memory shared by your projects and Codex agents. It is included by default in `personal`; the `developer` preset keeps it opt-in. Codex Kit configures the integration but deliberately does **not** install Obsidian, create accounts, or choose how your notes sync.

### 1. Prepare Obsidian once per device

1. Install the current [Obsidian desktop app](https://obsidian.md/download) using installer version 1.12.7 or newer.
2. Create or open a dedicated vault, for example `Codex Brain`. Keeping agent memory separate from general personal notes makes permissions and review much easier.
3. In Obsidian, open **Settings → General**, find the **Advanced** section, enable **Command line interface**, and follow the registration prompt.
4. Restart the terminal, keep Obsidian running, and verify `obsidian version`.

The official [Obsidian CLI documentation](https://obsidian.md/help/cli) is authoritative. The desktop app must be running; the first CLI call can launch it. On Linux, ensure `~/.local/bin` is on `PATH`. On macOS, registration may request administrator approval for `/usr/local/bin/obsidian`. On Windows, use the 1.12.7+ installer and restart the terminal so its redirector is on `PATH`. Treat WSL as a separate Linux environment and verify the `obsidian` command there; a command registered only in Windows is not automatically available to Linux-side Codex.

When Codex runs commands in a sandbox, an `EPERM` or `EACCES` result can mean that the sandbox cannot reach Obsidian's local CLI socket even though the app is installed and running. Retry the same `codex-kit brain ...` command with narrowly approved desktop/Obsidian CLI access; do not reinstall or reconfigure Obsidian for that error.

### 2. Configure Codex once per device

Run this from any Git project:

```text
codex-kit setup --preset personal --memories --allow-network --yes
codex-kit brain configure --vault "Codex Brain" --yes
```

`setup` installs the global Project Brain skill and bounded Codex policy. `brain configure` stores only the selected vault name in machine-local Codex Kit configuration. The optional `--memories` flag separately enables Codex's experimental native memory; omit it if you want Obsidian to be the only durable memory layer.

### 3. Enable the brain once per project

From the repository root:

```text
codex-kit project init --preset personal --yes
codex-kit brain init --yes
codex-kit brain status
```

Commit `.codex-kit/config.json`. It contains a stable `tools.obsidian.projectKey`, not the vault path or your notes. Remote-backed and committed repositories derive a portable identity; a brand-new empty repository receives a collision-resistant identity on first apply, which becomes portable when the config is committed. `brain init` creates this external namespace:

```text
Projects/<projectKey>/
├── Home.md
├── Decisions/
├── Lessons/
├── Runbooks/
└── Questions/
```

`Home.md` is human-owned. The category folders materialize when their first note is captured. Agent-authored notes are immutable, uniquely named records with flat metadata for project, kind, status, sources, verified commit, and supersession.

### Normal use: no recurring setup command

Open Codex in the configured project and work normally. The managed policy tells agents to retrieve a small, relevant context packet before substantial work and requires the parent agent to make a capture decision after validation and before final handoff. Durable decisions, recurring verified lessons, reusable runbooks, and unresolved cross-task questions are previewed, appended, and verified; routine work is explicitly skipped. Repository code, tests, and `AGENTS.md` remain authoritative; recalled notes are labelled as untrusted supporting context.

Project Brain remains curated and event-driven, not a background watcher. Subagents can propose concise Brain candidates, but only the parent writes a focused note and only when the validated result will help future work.

Recall is intentionally bounded to `Home.md` plus at most five relevant notes, no more than 2 KiB per note and 8 KiB overall. Default recall stays inside the current project. Cross-project recall must be explicitly requested.

For direct inspection or intentional capture:

```text
codex-kit brain recall --query "why invoices use UTC"
codex-kit brain recall --query "shared deployment lesson" --cross-project
codex-kit brain remember --kind decision --title "Use UTC invoice dates" --summary "Avoid timezone-dependent totals" --source "ADR-014" --yes
codex-kit brain audit
```

Use `--details`, `--source`, and `--supersedes` when the extra provenance is useful. Capture only stable decisions, lessons, runbooks, and unresolved questions—not transcripts, raw logs, source dumps, guesses, or secrets. Agents append new records and supersede old ones; they do not silently rewrite or delete history.

### Move to a new device

Install Obsidian and Codex Kit, make the dedicated vault available using your chosen file sync or [Obsidian Sync](https://obsidian.md/sync), enable the CLI, then repeat only the two device-level commands above. After cloning a configured repository, run `codex-kit project apply --yes` to provision its committed setup. You do not rerun setup for ordinary Codex tasks.

## Quick start in an existing project

Install Codex Kit, enter a Git project, and run the interactive setup:

```text
cd <git-project>
codex-kit wizard
```

The recommended wizard path uses `both` scope. It detects the project, explains the proposed global and project changes, asks before any network-backed plugin/MCP installation, recommends the Graphify adapter, and shows one combined preview before applying.

After setup:

```text
codex-kit diff
codex-kit project status
codex-kit doctor
```

Project mutations preview by default outside the wizard. Pass `--yes` to apply them; `--dry-run` always wins. `--json` is noninteractive.

## Actual use cases

### Onboard an existing repository

You clone a service or application and want Codex to work in the team's established way without hand-copying global prompts. From the repository root, run `codex-kit wizard`, accept the detected profile and the recommended project components, review the preview, and apply it. The repository then carries its profile-specific guidance, workflow skills, PromptX templates, and a committed `.codex-kit/config.json` that teammates can reproduce with the same command.

### Start productive work in a configured project

Open Codex in that project and describe the work normally. The generated `AGENTS.md` gives it the stack's conventions, test commands, boundaries, and definition of done; the personal preset also makes relevant project-brain context available by default. Use `$prompt-enhancer` when a request needs shaping, `$plan-with-subagents` for a non-trivial design, and `$implement-plan-with-subagents` once the plan is approved. A one-file fix stays direct; the richer workflows delegate only when the task warrants it.

### Coordinate a larger change without over-orchestrating

For a feature spanning several dependent phases, services, or repositories, use `$ruflo-orchestration`. It records decisions and task state while Codex remains responsible for the edits and tests. Routine features, formatting, and ordinary test runs do not need Ruflo; the included guidance keeps them on the normal, lightweight Codex path.

### Add confidence before release

Run `$qa-e2e-sweep` for evidence-based local QA, or `$playwright-e2e-setup` when a project needs browser coverage. Graphify is recommended during setup to make large repositories easier to navigate, but its adapter, graph build, and hooks require explicit choices so setup never surprises a developer or CI environment.

### Keep setup current over time

Commit `.codex-kit/config.json` with the project. A new developer runs the wizard after cloning; an existing developer can inspect `codex-kit project status`, preview changes with `codex-kit diff`, and apply intentional updates with `codex-kit project apply --yes`. The managed block preserves team-authored instructions outside it, and transaction receipts make a specific setup change reversible.

## Recommended developer foundation

The wizard always presents these recommendations:

- **Ponytail** — the global plugin used for reuse-first, dependency-light, smallest-correct implementation decisions.
- **Ruflo** — the global MCP used only when three or more dependent phases, multiple services/repositories, or durable task memory justify persistent orchestration.
- **Graphify** — a project-local structural map. It is always recommended; large repositories and monorepos receive stronger guidance. Adapter provisioning is opt-in, and graph builds and hooks remain separate explicit actions.
- **Model routing** — an optional global Codex profile and four custom-agent roles. It resolves the locally available catalog when applied, so the parent prefers Sol while bounded roles prefer Terra or Luna and fall back safely.
- **Obsidian Project Brain** — a global skill and policy plus a committed project key. It is included in `personal`, opt-in for `developer`, and uses only the official Obsidian CLI.

Declining network access leaves Ponytail and Ruflo as visible follow-up recommendations. Codex Kit never installs Obsidian itself, never performs network-backed plugin or MCP installation without explicit consent, and never runs Graphify implicitly.

## Optional dynamic model routing

Model routing is global and opt-in: it never changes a repository's configuration or your existing global default model. Enable the global policy and roles once, then inspect or refresh the role selections:

```text
codex-kit setup --model-routing --yes
codex-kit models status              # read-only
codex-kit models refresh --yes       # updates only Kit-owned role files
codex --profile codex-kit-orchestrator
```

At refresh time, Codex Kit reads `codex debug models`, selects the first available candidate in each tier, and writes only its namespaced `codex_kit_*` agents. The main profile prefers `gpt-5.6-sol`, then GPT-5.5 and GPT-5.4; mapper, worker, and reviewer roles prefer Terra; the support role prefers Luna. Missing candidates produce an inheriting role rather than a failed setup. Refresh after model availability changes.

The four roles are optional accelerators: `codex_kit_mapper` for read-only context mapping, `codex_kit_worker` for isolated implementation slices, `codex_kit_reviewer` for validation, and `codex_kit_support` for logs and documentation checks. Workflow skills fall back to ordinary bounded Codex subagents when a role is unavailable. Ruflo remains a separate provider and coordination system; its model aliases never control native Codex agents.

## Profiles and generated guidance

Profiles compose from general to specific:

| Detected project | Composed profiles |
| --- | --- |
| Node.js | `generic + node` |
| Nuxt | `generic + node + nuxt` |
| Angular or Nx Angular | `generic + node + angular` |
| Java | `generic + java` |
| Spring Boot | `generic + java + spring` |
| Quarkus | `generic + java + quarkus` |
| Flutter | `generic + flutter` |

Each profile is a bounded playbook covering architecture, framework conventions, clean-code boundaries, security, common commands, testing, skill routing, delegation, and definition of done. Shared rules live in `generic`; runtime and framework profiles add only their layer.

Codex Kit tests the common composed profile sets against Codex's default 32 KiB project-guidance budget so richer instructions do not silently crowd themselves out.

Codex Kit writes between `<!-- codex-kit:project:start -->` and `<!-- codex-kit:project:end -->`. Human-authored instructions outside that block are preserved.

## Bundled project skills

The developer preset installs the core skills below under `.agents/skills/`; the personal preset additionally installs the Obsidian Project Brain skill:

| Skill | Use |
| --- | --- |
| `$plan-with-subagents` | Read-only mapping, guard, and slicing for non-trivial plans |
| `$implement-plan-with-subagents` | Bounded implementation workers, tests, validation, and final review for approved plans |
| `$debug-fix-with-subagents` | Evidence-first reproduction and parallel root-cause scouting for non-trivial bugs |
| `$qa-e2e-sweep` | Evidence-based local UI/API/data/integration QA without silently fixing product code |
| `$playwright-e2e-setup` | Project-scoped, auth-safe, cross-platform Playwright setup |
| `$ruflo-orchestration` | Durable Ruflo coordination only when its threshold is met |
| `$prompt-enhancer` | Convert rough requests into focused, repo-aware Codex tasks |
| `$continuous-clean-code-refactor` | Requested maintainability and technical-debt cleanup |
| `$obsidian-project-brain` | Bounded project recall plus a required parent closeout decision for durable post-validation capture |

Delegation remains proportional: trivial and small targeted changes run directly; non-trivial planning, implementation, and debugging skills use one level of focused subagents with the main task owning decisions and integration.

PromptX also installs its runnable CLI and templates:

```text
node tools/promptx/promptx.mjs "Add invoice CSV export"
node tools/promptx/promptx.mjs --refresh-profile
```

## Commands

| Command | Purpose |
| --- | --- |
| `wizard` | Guided detection, recommendations, preview, consent, and apply |
| `setup --preset developer` | Plan global setup; add `--allow-network --yes` to install global integrations |
| `setup --preset personal [--memories] --yes` | Install the personal global policy and brain skill; optionally enable separate native Codex memory |
| `setup --model-routing` | Include the optional global model-routing profile and roles in setup |
| `models status`, `models refresh --yes` | Inspect or refresh Kit-owned capability-aware global model roles |
| `project init`, `plan`, `apply`, `refresh`, `status` | Manage a Git project's desired Codex setup |
| `brain configure --vault NAME --yes` | Select this device's Obsidian vault |
| `brain init --yes` | Create the current project's external vault namespace |
| `brain status`, `brain audit` | Inspect integration health and note metadata without writing |
| `brain recall --query QUERY [--cross-project]` | Retrieve bounded, labelled supporting context |
| `brain remember --kind KIND --title TITLE --summary SUMMARY --yes` | Append a durable note; supports `--details`, `--source`, and `--supersedes` |
| `component add/remove/list` | Change selected project components |
| `skill import` | Copy one validated local skill with provenance |
| `diff`, `history`, `rollback` | Review and recover managed project changes |
| `doctor`, `update --check`, `export` | Inspect prerequisites, pinned updates, and portable artifacts |

## Resulting project pattern

```text
<project>/
├── AGENTS.md
├── .agents/
│   └── skills/
│       └── obsidian-project-brain/  # personal preset
├── .codex-kit/
│   ├── config.json
│   ├── state.json
│   ├── tools/
│   └── transactions/
└── tools/
    └── promptx/
```

`.codex-kit/config.json` is the commit-friendly desired setup. Runtime state, locks, backups, and transaction receipts should remain ignored. Existing skill destinations are never overwritten; a collision is reported and the user-owned content is preserved.

When a component is removed, Codex Kit deletes only assets it previously installed and whose hashes are unchanged. Modified or pre-existing content is preserved and reported as a conflict.

## Safety and recovery

- A Git repository is required for project commands.
- Network access is explicit.
- Graphify installation, builds, and hooks are separate choices.
- Obsidian installation, vault sync, and CLI registration remain explicit user choices.
- Project-brain recall is bounded, project-scoped by default, and treated as untrusted context.
- Project-brain writes are append-only and reserved for the parent agent after validation; rollback never deletes external notes.
- Skills and PromptX assets are copied without executing them.
- Existing symlink or junction parents are rejected before managed writes, copies, or removals.
- Transactions record managed files and newly copied assets.
- Rollback refuses to overwrite content modified after the transaction.
- Secrets and raw private source are excluded from enrichment and portable exports.

Use `codex-kit history` to list receipts and `codex-kit rollback --transaction <id> --yes` to restore one.

## Platform support

| Platform | Support |
| --- | --- |
| Linux | Tier one |
| Windows 11, PowerShell and Command Prompt | Tier one |
| WSL2 | Linux environment; register the Obsidian CLI separately |
| Windows 10 and macOS | Best effort |

Node 20+, Git, and Codex are required. Obsidian desktop installer 1.12.7+ and its registered CLI are required only for Project Brain. GitHub CLI is needed only for private release downloads; Python is optional for Graphify.

## Install

For development from a clone:

```text
npm install
npm link
codex-kit doctor
```

For a private release, authenticate GitHub CLI and install the attached package:

```text
gh release download <release-tag> -R Lotthar/codex-kit --pattern "codex-kit-*.tgz"
npm install -g codex-kit-*.tgz
codex-kit wizard
```

See [SECURITY.md](SECURITY.md), [CHANGELOG.md](CHANGELOG.md), and [CONTRIBUTING.md](CONTRIBUTING.md).

Primary references: [Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md), [Codex skills](https://developers.openai.com/codex/skills), [Codex subagents](https://developers.openai.com/codex/subagents), [Codex MCP](https://developers.openai.com/codex/mcp), [Obsidian CLI](https://obsidian.md/help/cli), and [Playwright best practices](https://playwright.dev/docs/best-practices).
