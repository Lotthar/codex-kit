# Higgsfield skills provenance

- Source: https://github.com/higgsfield-ai/skills
- Commit: 27000402070db19d958789d05b3b52b6f4718d7c
- Version: 0.14.0
- Reviewed: 2026-11-13
- License: MIT; the upstream license is included in each installed skill.

The nine skill directories retain upstream content; LICENSE files were added for redistribution. To update, inspect an immutable upstream revision, replace the complete skill directories, restore the upstream license in each, update this record, and run global asset tests and package checks. Kit setup never runs upstream setup or downloads the CLI.

Codex Kit activation overlay: all nine skills set `policy.allow_implicit_invocation: false` in `agents/openai.yaml`; original explicit names and skill bodies remain available. `kit-media` provides the concise automatic entry point. Preserve this metadata overlay when updating upstream copies.
