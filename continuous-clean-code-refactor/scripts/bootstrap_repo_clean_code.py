#!/usr/bin/env python3
"""Initialize continuous clean-code refactor state for a repository."""

from __future__ import annotations

import argparse
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path


START = "<!-- codex-clean-code:start -->"
END = "<!-- codex-clean-code:end -->"

AGENTS_SECTION = """<!-- codex-clean-code:start -->
## Clean code and architecture rules
- Follow `.codex/clean-code-refactor/repo-patterns.md` when present.
- Preserve behavior unless the task explicitly requests behavior changes.
- Prefer guard clauses over deeply nested conditionals.
- Keep files, classes, functions, and modules cohesive and small.
- Inline trivial private delegates only when that improves readability and does not remove a useful boundary.
- Preserve public APIs, framework hooks, test seams, security checks, logging/audit boundaries, transactions, and domain language.
- Run the relevant formatter, linter, typecheck, build, and test commands for touched code.
- Leave touched code cleaner than you found it.
<!-- codex-clean-code:end -->
"""


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def find_repo_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in [current, *current.parents]:
        if (candidate / ".git").exists():
            return candidate
    return current


def backup_path(path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    base = path.with_name(f"{path.name}.bak-{stamp}")
    candidate = base
    index = 1
    while candidate.exists():
        candidate = path.with_name(f"{path.name}.bak-{stamp}-{index}")
        index += 1
    return candidate


def write_text_if_changed(path: Path, content: str, dry_run: bool) -> bool:
    if path.exists() and path.read_text(encoding="utf-8") == content:
        return False
    if dry_run:
        print(f"Would write {path}")
        return True
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"Wrote {path}")
    return True


def create_text_if_missing(path: Path, content: str, dry_run: bool) -> bool:
    if path.exists():
        print(f"Already exists; leaving unchanged: {path}")
        return False
    if dry_run:
        print(f"Would create {path}")
        return True
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"Created {path}")
    return True


def default_state(repo_root: Path) -> dict:
    now = utc_now()
    return {
        "active": True,
        "mode": "continuous-clean-code-refactor",
        "repository_root": str(repo_root),
        "started_at": now,
        "last_updated_at": now,
        "quality_gates": [],
        "completed_batches": [],
        "remaining_focus_areas": [],
        "blocked_items": [],
        "baseline_failures": [],
        "max_stop_continuations": 8,
        "stop_continuations_used": 0,
        "final_verification_passed": False,
    }


def ensure_state(path: Path, repo_root: Path, dry_run: bool) -> None:
    defaults = default_state(repo_root)
    if not path.exists():
        if dry_run:
            print(f"Would create {path}")
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(defaults, indent=2) + "\n", encoding="utf-8")
        print(f"Created {path}")
        return

    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        print(f"State file is not valid JSON; leaving unchanged: {path}")
        return

    changed = False
    for key, value in defaults.items():
        if key not in state:
            state[key] = value
            changed = True
    if state.get("repository_root") != str(repo_root):
        state["repository_root"] = str(repo_root)
        changed = True
    if changed:
        state["last_updated_at"] = utc_now()
        if dry_run:
            print(f"Would update missing keys in {path}")
        else:
            path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
            print(f"Updated {path}")
    else:
        print(f"State already initialized: {path}")


def upsert_section(existing: str, section: str) -> str:
    if START in existing and END in existing:
        before, rest = existing.split(START, 1)
        _, after = rest.split(END, 1)
        return before.rstrip() + "\n\n" + section.rstrip() + "\n" + after
    if existing.strip():
        return existing.rstrip() + "\n\n" + section
    return section


def ensure_agents_section(path: Path, dry_run: bool) -> None:
    original = path.read_text(encoding="utf-8") if path.exists() else ""
    updated = upsert_section(original, AGENTS_SECTION)
    if updated == original:
        print(f"AGENTS.md already has clean-code section: {path}")
        return
    if dry_run:
        print(f"Would update {path}")
        if path.exists():
            print(f"Would back up {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        backup = backup_path(path)
        shutil.copy2(path, backup)
        print(f"Backed up {path} to {backup}")
    path.write_text(updated, encoding="utf-8")
    print(f"Updated {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Print actions without writing files.")
    args = parser.parse_args()

    repo_root = find_repo_root(Path.cwd())
    clean_dir = repo_root / ".codex" / "clean-code-refactor"
    if args.dry_run:
        print(f"Repository root: {repo_root}")
        print(f"Would ensure {clean_dir}")
    else:
        clean_dir.mkdir(parents=True, exist_ok=True)
        print(f"Repository root: {repo_root}")
        print(f"Ensured {clean_dir}")

    ensure_state(clean_dir / "state.json", repo_root, args.dry_run)

    repo_patterns = clean_dir / "repo-patterns.md"
    cleanup_plan = clean_dir / "cleanup-plan.md"
    create_text_if_missing(
        repo_patterns,
        "# Clean Code Repository Patterns\n\n"
        "Run `audit_repo_patterns.py` to populate detected languages, frameworks, quality gates, source directories, tests, and local cleanup conventions.\n",
        args.dry_run,
    )
    create_text_if_missing(
        cleanup_plan,
        "# Clean Code Cleanup Plan\n\n"
        "Run `audit_repo_patterns.py`, then convert detected hotspots into small behavior-preserving cleanup batches.\n",
        args.dry_run,
    )
    ensure_agents_section(repo_root / "AGENTS.md", args.dry_run)

    print("\nNext steps:")
    print("1. Run audit_repo_patterns.py from the repository root.")
    print("2. Review .codex/clean-code-refactor/repo-patterns.md and cleanup-plan.md.")
    print("3. Pick one small cleanup batch, preserve behavior, and run relevant checks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
