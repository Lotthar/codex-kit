---
name: kit-engineering
description: Lightweight engineering entry point for coding, refactoring, and technical reviews. Use to keep changes simple, expose material assumptions, and verify observable success without loading overlapping specialist workflows.
---

# Kit engineering

Use this as the default engineering operating layer. Repository instructions and the user's request take priority.

1. Establish the smallest observable outcome, the relevant files, and a proportionate check before editing.
2. Treat uncertain requirements as assumptions. State or ask about them only when they could change scope, behavior, safety, or the chosen design.
3. Make the smallest cohesive change that meets the outcome. Reuse local patterns and dependencies; avoid speculative abstractions, broad cleanup, and unrelated formatting.
4. Preserve public behavior and unrelated work. Handle errors at real boundaries; do not add defensive machinery for impossible paths.
5. Run the narrowest meaningful validation, inspect the final diff, and report evidence, skipped checks, and remaining risks.

Existing project rules own planning, debugging, implementation delegation, testing, QA, releases, and security. Do not load another workflow merely to repeat this guidance. Keep every `$skill-name` direct call available; consult focused legacy guidance only when needed, and do not start its setup, specification, ticket, review, or publish workflow unless the user requests it.

Always follow mandatory external-platform skills when their platform or tool is in scope.
