---
name: kit-ui
description: Compact entry point for user-facing UI and interaction work. Use to preserve the existing design system, make focused visual decisions, and verify implemented behavior without automatically loading overlapping design skills.
---

# Kit UI

Start with the current product, component conventions, and design system. Preserve established tokens, patterns, accessibility expectations, and responsive behavior unless the request changes them.

For a meaningful visual or interaction choice, consult local UI/UX guidance only when it can inform that choice. Keep the lookup focused and small:

```bash
python3 -B "${CODEX_HOME:-$HOME/.codex}/skills/ui-ux-pro-max/scripts/search.py" "<focused terms>" -n 2
```

Do not search for routine styling, and do not persist or create design-system assets unless requested. The project UI implementation and verification workflow owns coding, accessibility, browser checks, and tests. Keep every `$skill-name` direct call available; consult focused legacy guidance only when needed, and do not start its setup, specification, ticket, review, or publish workflow unless the user requests it.

Websites inside an existing repository remain engineering/UI work. Always follow mandatory external-platform skills when their platform or tool is in scope.
