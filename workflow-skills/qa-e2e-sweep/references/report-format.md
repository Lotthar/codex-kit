# QA report format

Write one report per run. Keep large logs and binaries in artifact directories and link their paths.

```markdown
# QA Sweep Report

## Summary
- App, branch, commit, date/time, environment, tester
- Scope and overall result
- Highest severity and finding count

## Runtime discovery
- Install, start, migrate, seed, test, and teardown commands
- Services, ports, fixtures, roles, assumptions, and baseline failures

## Strategy
- Feature inventory
- Risk map
- Selected test matrix
- Delegation used
- Intentionally excluded areas

## Coverage
| Area | Flows and states | Evidence | Result | Gaps or blockers |
| --- | --- | --- | --- | --- |

## Findings

### [P?][Confidence] Title
- ID:
- Area:
- Environment and commit:
- Preconditions:
- Reproduction:
  1.
  2.
  3.
- Expected:
- Actual:
- Evidence and artifact paths:
- Likely files or symbols:
- Suspected cause (inference):
- Suggested fix direction:
- Regression-test recommendation:

## Blocked or untested
- Area, reason, prerequisite, and risk

## Commands and artifacts
- Commands run and outcomes
- Commands not run and reasons
- Artifact paths

## Next verification
- Safest next step and rerun commands
```

Do not create external issues from this report unless the user explicitly requests that separate action.
