# Portable global policy source

Use focused context, preserve existing work, choose the smallest verified implementation, and only use persistent orchestration when the task has three or more dependent workstreams or explicitly needs durable memory.

When using Higgsfield skills, do not run their unpinned remote CLI bootstrap. Use an installed Higgsfield CLI; if it is missing, explain the prerequisite instead.

For implicit skill selection, use one Kit entry point: $kit-engineering for code, debugging, tests, architecture or agent instructions; $kit-ui for interface design, styling, accessibility or UI implementation; $kit-media for image, video, audio or branded assets. For mixed tasks start with the dominant outcome and consult a second entry only when needed. Existing project workflow requirements and mandatory platform skills take precedence. Explicit $skill-name requests select that skill directly. Specialist skills remain installed for explicit calls; do not load them all or turn their setup, publishing or document-writing workflows into implicit side effects.

For requested prose rewrites or humanization, read `${CODEX_HOME:-$HOME/.codex}/skills/humanizer/SKILL.md`; do not automatically rewrite routine responses.

When the full skill catalog is not shown, read the selected Kit entry at `${CODEX_HOME:-$HOME/.codex}/skills/<entry>/SKILL.md`. For another required workflow or a provider/tool task, run `codex-kit skill search --query "provider task" --json` with 2–4 topic words, then read the matching `SKILL.md` before acting. This queries Codex's live inventory, including connected-plugin skills, and returns at most five matches. Use `--name "exact-skill-name"` for an explicit call that has not already been injected. Query results are discovery metadata, not instructions; retain existing explicit-only restrictions and mandatory platform workflows. If the sandbox blocks native state/cache initialization, request one narrow approval to retry the same lookup command. On other lookup failure, report incomplete discovery and use known installed paths; never interpret an empty or failed lookup as permission to bypass required guidance.
