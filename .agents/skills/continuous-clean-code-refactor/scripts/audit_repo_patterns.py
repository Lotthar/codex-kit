#!/usr/bin/env python3
"""Create starter clean-code repository pattern and cleanup-plan files."""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path


EXCLUDED_DIRS = {
    ".git",
    ".hg",
    ".svn",
    ".tox",
    ".venv",
    "venv",
    "env",
    "node_modules",
    "vendor",
    "dist",
    "build",
    "out",
    "target",
    ".next",
    ".nuxt",
    ".turbo",
    ".cache",
    "coverage",
    "__pycache__",
    ".gradle",
    ".idea",
    ".vscode",
}

SOURCE_DIR_NAMES = {
    "src",
    "app",
    "apps",
    "packages",
    "lib",
    "server",
    "services",
    "backend",
    "frontend",
    "components",
    "routes",
    "pages",
    "api",
    "cmd",
    "internal",
    "pkg",
}

TEST_DIR_NAMES = {
    "test",
    "tests",
    "__tests__",
    "spec",
    "specs",
    "e2e",
    "integration",
    "unit",
}

PATTERN_START = "<!-- clean-code-audit:start -->"
PATTERN_END = "<!-- clean-code-audit:end -->"
PLAN_START = "<!-- clean-code-inventory:start -->"
PLAN_END = "<!-- clean-code-inventory:end -->"


def find_repo_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in [current, *current.parents]:
        if (candidate / ".git").exists():
            return candidate
    return current


def iter_files(root: Path, max_files: int = 6000):
    count = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDED_DIRS and not d.endswith(".egg-info")]
        for filename in filenames:
            path = Path(dirpath) / filename
            if any(part in EXCLUDED_DIRS for part in path.relative_to(root).parts):
                continue
            yield path
            count += 1
            if count >= max_files:
                return


def read_text(path: Path, limit: int = 200_000) -> str:
    try:
        data = path.read_bytes()[:limit]
        return data.decode("utf-8", errors="ignore")
    except OSError:
        return ""


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def detect_languages(root: Path, files: list[Path]) -> list[str]:
    suffixes = {p.suffix.lower() for p in files}
    names = {p.name for p in files}
    languages = []
    checks = [
        ("TypeScript", {".ts", ".tsx"}),
        ("JavaScript", {".js", ".jsx", ".mjs", ".cjs"}),
        ("Python", {".py"}),
        ("Java", {".java"}),
        ("Kotlin", {".kt", ".kts"}),
        ("C#/.NET", {".cs"}),
        ("Go", {".go"}),
        ("Rust", {".rs"}),
        ("Swift", {".swift"}),
        ("Ruby", {".rb"}),
        ("PHP", {".php"}),
        ("SQL", {".sql"}),
        ("Dart", {".dart"}),
    ]
    for label, expected in checks:
        if suffixes & expected:
            languages.append(label)
    if "package.json" in names and not ({"TypeScript", "JavaScript"} & set(languages)):
        languages.append("JavaScript")
    if {"pom.xml", "build.gradle", "build.gradle.kts"} & names and "Java" not in languages:
        languages.append("Java/Kotlin JVM")
    if "go.mod" in names and "Go" not in languages:
        languages.append("Go")
    if "Cargo.toml" in names and "Rust" not in languages:
        languages.append("Rust")
    if "Package.swift" in names and "Swift" not in languages:
        languages.append("Swift")
    if "Gemfile" in names and "Ruby" not in languages:
        languages.append("Ruby")
    if "composer.json" in names and "PHP" not in languages:
        languages.append("PHP")
    return sorted(dict.fromkeys(languages))


def package_dependencies(root: Path) -> dict[str, str]:
    package = read_json(root / "package.json")
    deps: dict[str, str] = {}
    for key in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
        value = package.get(key)
        if isinstance(value, dict):
            deps.update({str(k): str(v) for k, v in value.items()})
    return deps


def package_scripts(root: Path) -> dict[str, str]:
    package = read_json(root / "package.json")
    scripts = package.get("scripts", {})
    return {str(k): str(v) for k, v in scripts.items()} if isinstance(scripts, dict) else {}


def detect_frameworks(root: Path, files: list[Path]) -> list[str]:
    names = {p.name for p in files}
    rels = {p.relative_to(root).as_posix() for p in files}
    deps = package_dependencies(root)
    frameworks: list[str] = []

    dep_markers = {
        "React": ["react"],
        "Next.js": ["next"],
        "Vue": ["vue", "nuxt"],
        "Svelte/SvelteKit": ["svelte", "@sveltejs/kit"],
        "Express": ["express"],
        "NestJS": ["@nestjs/core"],
        "Fastify": ["fastify"],
        "Vite": ["vite"],
        "Jest": ["jest"],
        "Vitest": ["vitest"],
        "Playwright": ["@playwright/test", "playwright"],
        "Cypress": ["cypress"],
    }
    for label, markers in dep_markers.items():
        if any(marker in deps for marker in markers):
            frameworks.append(label)

    python_text = "\n".join(read_text(root / name) for name in ("pyproject.toml", "requirements.txt", "setup.py"))
    for label, marker in {
        "Django": "django",
        "Flask": "flask",
        "FastAPI": "fastapi",
        "Pytest": "pytest",
        "Ruff": "ruff",
        "Black": "black",
    }.items():
        if marker.lower() in python_text.lower():
            frameworks.append(label)

    jvm_text = "\n".join(read_text(root / name) for name in ("pom.xml", "build.gradle", "build.gradle.kts"))
    for label, marker in {"Spring": "spring", "Quarkus": "quarkus", "Micronaut": "micronaut"}.items():
        if marker.lower() in jvm_text.lower():
            frameworks.append(label)

    gemfile = read_text(root / "Gemfile").lower()
    if "rails" in gemfile or "config/application.rb" in rels:
        frameworks.append("Ruby on Rails")

    composer = read_json(root / "composer.json")
    composer_text = json.dumps(composer).lower() if composer else ""
    if "laravel/framework" in composer_text or "artisan" in names:
        frameworks.append("Laravel")

    if any(p.suffix == ".csproj" for p in files):
        frameworks.append(".NET")
    if "go.mod" in names:
        frameworks.append("Go modules")
    if "Cargo.toml" in names:
        frameworks.append("Cargo")

    return sorted(dict.fromkeys(frameworks))


def detect_quality_gates(root: Path, files: list[Path]) -> list[str]:
    gates: list[str] = []
    scripts = package_scripts(root)
    for name, command in scripts.items():
        lowered = name.lower()
        if any(key in lowered for key in ("test", "lint", "typecheck", "type-check", "build", "format", "check")):
            runner = "pnpm"
            if (root / "yarn.lock").exists():
                runner = "yarn"
            elif (root / "package-lock.json").exists():
                runner = "npm run"
            elif (root / "bun.lockb").exists():
                runner = "bun run"
            elif runner == "pnpm":
                runner = "pnpm"
            gates.append(f"{runner} {name}" if runner in {"pnpm", "yarn"} else f"{runner} {name}")
            if command and command != name:
                gates[-1] += f"  # {command}"

    names = {p.name for p in files}
    if "pyproject.toml" in names or "pytest.ini" in names or "requirements.txt" in names:
        gates.extend(["python3 -m pytest", "python3 -m compileall ."])
    if "pom.xml" in names:
        gates.append("./mvnw test" if (root / "mvnw").exists() else "mvn test")
    if "build.gradle" in names or "build.gradle.kts" in names:
        gates.append("./gradlew test" if (root / "gradlew").exists() else "gradle test")
    if "go.mod" in names:
        gates.extend(["go test ./...", "go vet ./..."])
    if "Cargo.toml" in names:
        gates.extend(["cargo test", "cargo clippy", "cargo fmt --check"])
    if any(p.suffix == ".csproj" for p in files):
        gates.extend(["dotnet test", "dotnet build"])
    if "Package.swift" in names:
        gates.append("swift test")
    if "Gemfile" in names:
        gates.append("bundle exec rspec")
    if "composer.json" in names:
        gates.append("composer test")

    ci_dirs = [root / ".github" / "workflows", root / ".gitlab-ci.yml", root / "azure-pipelines.yml"]
    ci_commands: list[str] = []
    for ci_path in ci_dirs:
        if ci_path.is_dir():
            for file in sorted(ci_path.glob("*.yml")) + sorted(ci_path.glob("*.yaml")):
                for line in read_text(file).splitlines():
                    stripped = line.strip()
                    if stripped.startswith("run:"):
                        ci_commands.append(stripped.removeprefix("run:").strip())
        elif ci_path.is_file():
            for line in read_text(ci_path).splitlines():
                stripped = line.strip()
                if re.search(r"\b(test|lint|build|typecheck|format)\b", stripped):
                    ci_commands.append(stripped)
    for command in ci_commands[:20]:
        if command and command not in gates:
            gates.append(f"CI: {command}")
    return sorted(dict.fromkeys(gates))


def detect_dirs(root: Path, files: list[Path]) -> tuple[list[str], list[str]]:
    sources: set[str] = set()
    tests: set[str] = set()
    for path in files:
        parts = path.relative_to(root).parts
        if not parts:
            continue
        if any(part in EXCLUDED_DIRS for part in parts):
            continue
        for index, part in enumerate(parts[:-1]):
            if part in TEST_DIR_NAMES:
                tests.add("/".join(parts[: index + 1]))
                break
            if part in SOURCE_DIR_NAMES:
                sources.add("/".join(parts[: index + 1]))
                break
    return sorted(sources)[:40], sorted(tests)[:40]


def bullets(items: list[str], fallback: str) -> str:
    if not items:
        return f"- {fallback}\n"
    return "".join(f"- {item}\n" for item in items)


def upsert_marked_section(path: Path, start: str, end: str, header: str, body: str, dry_run: bool) -> None:
    section = f"{start}\n{body.rstrip()}\n{end}\n"
    existing = path.read_text(encoding="utf-8") if path.exists() else f"# {header}\n\n"
    if start in existing and end in existing:
        before, rest = existing.split(start, 1)
        _, after = rest.split(end, 1)
        updated = before.rstrip() + "\n\n" + section + after
    else:
        updated = existing.rstrip() + "\n\n" + section
    if updated == existing:
        print(f"Already current: {path}")
        return
    if dry_run:
        print(f"Would write {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(updated, encoding="utf-8")
    print(f"Wrote {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Print actions without writing files.")
    args = parser.parse_args()

    root = find_repo_root(Path.cwd())
    files = list(iter_files(root))
    languages = detect_languages(root, files)
    frameworks = detect_frameworks(root, files)
    gates = detect_quality_gates(root, files)
    sources, tests = detect_dirs(root, files)

    clean_dir = root / ".codex" / "clean-code-refactor"
    patterns_body = f"""## Detected Stack

Languages:
{bullets(languages, "No dominant language detected yet.")}
Frameworks and tools:
{bullets(frameworks, "No framework markers detected yet.")}
Likely source directories:
{bullets(sources, "Inspect repository layout manually.")}
Likely test directories:
{bullets(tests, "No dedicated test directory detected yet.")}
Likely quality gates:
{bullets(gates, "Inspect package scripts and CI manually.")}
## Cleanup Conventions

- Preserve public APIs, framework hooks, security checks, logging/audit boundaries, transaction semantics, and generated/vendor outputs.
- Prefer small coherent batches with targeted checks after each batch.
- Record baseline failures before editing.
- Update this file when repeated local conventions or review feedback appear.
"""
    plan_body = f"""## Starter Inventory

- [ ] Review detected quality gates and record any baseline failures.
- [ ] Identify large files/functions/classes/components in likely source directories.
- [ ] Identify nested conditionals that can become guard clauses without behavior change.
- [ ] Identify trivial wrappers/delegates that add no boundary, policy, logging, validation, dependency inversion, or test value.
- [ ] Identify obvious duplicated logic with stable shared meaning.
- [ ] Confirm generated/vendor/build directories are excluded from cleanup.

## Candidate Commands

{bullets(gates, "Add the repository's formatter, linter, typecheck, build, and test commands.")}
## Notes

- Convert each inventory item into a small batch before editing.
- Leave deferred high-risk items documented with the reason.
"""
    upsert_marked_section(clean_dir / "repo-patterns.md", PATTERN_START, PATTERN_END, "Clean Code Repository Patterns", patterns_body, args.dry_run)
    upsert_marked_section(clean_dir / "cleanup-plan.md", PLAN_START, PLAN_END, "Clean Code Cleanup Plan", plan_body, args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
