# Changelog

## 0.2.0-beta.2

- Added opt-in global model routing that resolves the available Codex model catalog into an orchestrator profile and namespaced mapper, worker, reviewer, and support agents.
- Added `models status` and `models refresh --yes`; managed role files are transactional and preserve user-owned collisions.

## Unreleased

- Added read-only `context status` diagnostics for global/project `AGENTS.md` byte accounting, the Brain recall budget, and duplicate Kit-owned skill names.
- Reduced always-loaded profile guidance and added managed static-context budgets without estimating tokens or quota savings.
- Added PromptX `--compact` for deterministic, redacted task packets capped at 3 KiB while retaining the existing full output by default.
- Tightened Project Brain recall to ranked metadata, three notes, 1 KiB blocks, and 4 KiB total, with metadata-only suppression for unsafe or malformed content.
- Documented the approval-gated learning contract: native memory for stable personal preferences, Project Brain for verified project knowledge, and skills for proven procedures.
- Added the optional Obsidian Project Brain integration: official-CLI configuration, stable project namespaces, bounded recall, append-only durable notes, audit/status commands, and a global Codex skill and policy.
- Added the Project Brain to the `personal` preset while keeping it opt-in for `developer`, with machine-local vault selection and commit-friendly project keys for repeatable setup on new devices.
- Added explicit opt-in support for native Codex memories as a separate experimental layer.
- Documented one-time Obsidian CLI setup, normal no-recurring-command use, cross-platform caveats, new-device onboarding, and the Project Brain trust and privacy model.
- Expanded layered framework profiles with architecture boundaries, commands, tests, security guidance, and skill routing.
- Added portable planning, implementation, debugging, QA, Playwright, and Ruflo skills with proportional one-level subagent workflows.
- Consolidated loose setup prompts into packaged project skills and PromptX runtime assets.
- Made the wizard consistently recommend Ponytail, Ruflo, and Graphify with explicit global/project and network-consent boundaries.
- Added manifest-driven, staged project asset provisioning that preserves colliding user-owned skills and participates in rollback.
- Added symlink/junction escape checks, whole-receipt rollback preflight, safe owned-asset upgrades, and reversible Graphify/component cleanup.

## 0.2.0-beta.1

- Adds Linux and native Windows support, transactional receipts, a wizard, Angular and Spring profiles, and private release packaging.
