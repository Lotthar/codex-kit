# Continuous Clean Code Refactor Rubric

Use this checklist to rank cleanup findings before editing. Resolve critical and high findings first, but only when the refactor can preserve behavior and be verified.

## Critical

- Behavior change without authorization.
- Broken tests, build, typecheck, lint, or formatter caused by the refactor.
- Public API break without authorization.
- Security, validation, logging, audit, transaction, permission, or retry semantics changed.
- Generated, vendor, build, lock, cache, or vendored dependency files modified unintentionally.

## High

- Large function, class, component, module, or file remains without documented reason.
- Nested conditionals remain where guard clauses would clearly simplify the flow.
- Dependency direction violates existing architecture.
- Duplicated logic remains where safe extraction is obvious and stable.
- Trivial wrappers or delegates remain without naming, boundary, policy, logging, validation, dependency inversion, test, or framework value.

## Medium

- Names hide intent or use inconsistent domain language.
- Mixed abstraction levels force readers to jump between high-level policy and low-level mechanics.
- Excessive comments explain unclear code instead of making the code clearer.
- Utility dumping grounds collect unrelated helpers.
- Module cohesion is weak or responsibilities are blurred.
- Indirection exists without a clear readability, boundary, or testability benefit.

## Low

- Minor formatting, ordering, grouping, or import issues.
- Small readability improvements that are not worth risky churn.
- Local duplication that is clearer than a premature shared abstraction.

## Definition of Done

- All critical and high findings are resolved or documented as intentionally deferred.
- Relevant checks pass for every touched area, or pre-existing failures are recorded.
- The final summary explains what changed, why it is behavior-preserving, what was verified, and what remains.
