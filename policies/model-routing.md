## Optional model routing

Codex Kit model routing is a global, opt-in preference. It resolves the strongest available parent model and lower-cost roles from the local Codex model catalog when it is applied or refreshed.

- Use the parent thread for architecture, sensitive decisions, integration, and the final result.
- Use the mapper role for bounded read-only repository discovery.
- Use the worker role only for a non-overlapping, parent-owned implementation or test slice.
- Use the reviewer role for focused validation and diff review.
- Use the support role for logs, documentation, and other bounded evidence gathering.
- If a Kit role is unavailable, use one ordinary bounded Codex subagent with the same responsibility; do not block the task on a model name.
- Refresh selections with `codex-kit models refresh --yes` after account or client model availability changes.
- Ruflo model routing is separate from native Codex model routing. Do not pass Codex model names to Ruflo.
