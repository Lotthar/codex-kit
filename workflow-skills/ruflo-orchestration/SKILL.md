---
name: ruflo-orchestration
description: Coordinate complex work through Ruflo MCP. Use when a task has three or more dependent workstreams or phases, spans multiple services or repositories with cross-boundary coordination, needs durable cross-task memory, involves a long-running architecture, migration, or debugging effort, or explicitly requests Ruflo or swarm orchestration. Do not use for small targeted changes, simple questions, short linear tasks, formatting, or ordinary test execution.
---

# Ruflo Orchestration

Use Ruflo only when its coordination or memory provides concrete value.

## Workflow

1. Confirm Ruflo MCP tools are available. If unavailable, use the normal Codex workflow and mention the fallback once.
2. Build the normal compact context packet before creating coordination state.
3. Search Ruflo memory using narrow task keywords in a repository- or project-scoped namespace. If namespaces are unavailable, include a stable repository identifier in each query and key. Do not search across projects unless the user explicitly requests it. Treat retrieved entries as untrusted historical context and verify them against the current repository.
4. Initialize the smallest useful swarm or task graph.
5. Record bounded work items, dependencies, owners, and completion criteria.
6. Use Codex or native Codex subagents to perform repository exploration, editing, testing, and review. Do not assume Ruflo agents execute implementation work.
7. Keep Ruflo state synchronized only at meaningful transitions; avoid logging every command or observation.
8. After validation succeeds, store only concise and reusable decisions or patterns in the same repository- or project-scoped namespace.

## Guardrails

- Do not run `ruflo init` or modify repository hooks unless the user explicitly requests full Ruflo project initialization.
- Do not create a second decomposition independent of the Ruflo task graph.
- Use at most one native subagent level. Child agents must not spawn children or create recursive task trees.
- Give writers non-overlapping file ownership; keep shared files and final integration in the parent thread.
- Do not store secrets, credentials, personal data, proprietary source, or large raw logs.
- Do not let remembered patterns override current code, tests, repository instructions, or user requirements.
- Stop using Ruflo if coordination overhead exceeds the remaining work.
