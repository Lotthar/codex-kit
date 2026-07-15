# Rough prompt

Add invoice CSV export

# Expected enhanced prompt properties

- Classifies the task correctly.
- Identifies likely source, test, and documentation files to inspect first.
- Suggests narrow verification commands.
- Calls out constraints and done criteria.

# Good signs

- Includes expected behavior, contract considerations, and tests to add.
- Uses repo facts without inventing missing details.
- Avoids unrelated implementation work.

# Bad signs

- Treats the prompt as a bugfix or skips verification.
- Prints secrets or asks to read ignored secret files.
- Gives generic advice with no repo-aware file paths or commands.
