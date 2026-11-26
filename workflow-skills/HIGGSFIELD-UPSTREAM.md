# Higgsfield skills provenance

- Source: https://github.com/higgsfield-ai/skills
- Commit: 27000402070db19d958789d05b3b52b6f4718d7c
- Version: 0.14.0
- Reviewed: 2026-11-13
- License: MIT; the upstream license is included in each retained copy.

The nine Kit directories retain the reviewed upstream content for provenance, but global Kit setup no longer installs them. The maintained active copies live in creator-operations-skills and install through the exact-ref content command. Update that repository after reviewing an immutable upstream revision; keep the license and explicit invocation policy, then run its tests and Kit content migration checks. Kit setup never runs upstream setup or downloads the CLI.

Historical Kit activation overlay: all nine retained copies set `policy.allow_implicit_invocation: false` in `agents/openai.yaml`; original explicit names and skill bodies remain available. `kit-media` provides the concise automatic entry point. Preserve this metadata overlay when updating upstream copies.
