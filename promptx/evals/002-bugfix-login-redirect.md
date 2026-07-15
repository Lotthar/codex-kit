# Rough prompt

Fix login redirect bug

# Expected enhanced prompt properties

- Classifies the task correctly.
- Identifies likely source, test, and documentation files to inspect first.
- Suggests narrow verification commands.
- Calls out constraints and done criteria.

# Good signs

- Includes reproduction guidance and regression test expectations.
- Uses repo facts without inventing missing details.
- Avoids unrelated implementation work.

# Bad signs

- Jumps to broad auth rewrites without reproduction.
- Prints secrets or asks to read ignored secret files.
- Gives generic advice with no repo-aware file paths or commands.
