# Rough prompt

Audit webhook signature verification security

# Expected enhanced prompt properties

- Classifies the task correctly.
- Identifies likely source, test, and documentation files to inspect first.
- Suggests narrow verification commands.
- Calls out constraints and done criteria.

# Good signs

- Includes threat model, sensitive-data handling, and abuse cases.
- Uses repo facts without inventing missing details.
- Avoids unrelated implementation work.

# Bad signs

- Ignores replay, malformed signatures, or secret handling.
- Prints secrets or asks to read ignored secret files.
- Gives generic advice with no repo-aware file paths or commands.
