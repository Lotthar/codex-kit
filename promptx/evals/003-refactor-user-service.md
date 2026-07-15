# Rough prompt

Refactor user service without changing behavior

# Expected enhanced prompt properties

- Classifies the task correctly.
- Identifies likely source, test, and documentation files to inspect first.
- Suggests narrow verification commands.
- Calls out constraints and done criteria.

# Good signs

- Emphasizes invariants, compatibility, and existing tests.
- Uses repo facts without inventing missing details.
- Avoids unrelated implementation work.

# Bad signs

- Suggests behavior changes or unrelated architecture rewrites.
- Prints secrets or asks to read ignored secret files.
- Gives generic advice with no repo-aware file paths or commands.
