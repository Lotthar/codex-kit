#!/usr/bin/env node
/**
 * Bootstrap Graphify for Codex in the current Git repository.
 *
 * Graphify's PyPI distribution is named `graphifyy`; its executable is
 * `graphify`. This script intentionally uses only Node.js standard libraries
 * so it can be copied into repositories that do not use Node or package.json.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const GRAPHIFY_PACKAGE = "graphifyy";
const COST_IGNORE_LINE = "graphify-out/cost.json";
const POLICY_START = "<!-- BEGIN GRAPHIFY CODEX POLICY -->";
const POLICY_END = "<!-- END GRAPHIFY CODEX POLICY -->";
const GRAPHIFY_IGNORE_DEFAULT = `# Graphify also respects .gitignore automatically.
node_modules/
dist/
build/
coverage/
.venv/
venv/
vendor/
target/
.next/
.nuxt/
`;
const GRAPHIFY_POLICY = `${POLICY_START}
## Graphify-first codebase navigation

Codex must use Graphify before broad raw file search, architecture exploration, dependency tracing, cross-file impact analysis, or unfamiliar-code orientation.

Required workflow:

1. If \`graphify-out/graph.json\` exists, query it before using broad \`grep\`, \`rg\`, \`find\`, globbing, or file-by-file reading:
   \`graphify query "<task-specific question>" --graph graphify-out/graph.json\`
2. For architecture or subsystem orientation, read \`graphify-out/GRAPH_REPORT.md\` first.
3. Do not skip Graphify because \`graphify-out/\` is dirty or has uncommitted changes. Graphify output is generated state and may normally change during work.
4. Use raw search only after Graphify narrows the likely modules, files, symbols, or concepts.
5. After significant code changes, refresh the graph from the repo root:
   \`graphify . --update\`
6. Inside Codex, use \`$graphify .\` when an explicit Graphify build or rebuild is needed. In a terminal, use \`graphify .\`.

If Graphify is missing, broken, or \`graphify-out/graph.json\` does not exist, state that clearly, then fall back to normal repository exploration.
${POLICY_END}
`;

function printUsage() {
  console.log(`Usage:
  node scripts/setup-graphify-codex.mjs [repo-path] [options]

Options:
  --repo <path>              Repository path. Defaults to current working directory.
  --skip-install             Do not install or upgrade Graphify; require existing graphify CLI.
  --skip-user-config         Do not edit ~/.codex/config.toml or $CODEX_HOME/config.toml.
  --skip-build               Do not run graphify to build/update graphify-out/.
  --skip-git-hooks           Do not run graphify hook install.
  --strict-build             Treat graph build failure as fatal.
  --extras <extras>          Optional Graphify extras, e.g. openai,pdf,office or all.
  --prefer <tool>            Preferred installer: uv, pipx, or pip. Default: auto.
  --dry-run                  Print planned file changes and commands without applying them.
  --verbose                  Print detailed command output and decisions.
  --help                     Show help.

Environment:
  GRAPHIFY_EXTRAS            Same as --extras.
  GRAPHIFY_BUILD=0           Same as --skip-build.
  CODEX_HOME                 Codex config home; default ~/.codex.`);
}

function parseArgs(args) {
  const options = {
    repoPath: undefined,
    skipInstall: false,
    skipUserConfig: false,
    skipBuild: process.env.GRAPHIFY_BUILD === "0",
    skipGitHooks: false,
    strictBuild: false,
    extras: process.env.GRAPHIFY_EXTRAS ?? "",
    prefer: "auto",
    dryRun: false,
    verbose: false,
    help: false
  };
  const positional = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const [name, inlineValue] = argument.split("=", 2);
    const needsValue = new Set(["--repo", "--extras", "--prefer"]);
    if (needsValue.has(name)) {
      const value = inlineValue ?? args[++index];
      if (!value || value.startsWith("--")) {
        throw new Error(`${name} requires a value.`);
      }
      if (name === "--repo") options.repoPath = value;
      if (name === "--extras") options.extras = value;
      if (name === "--prefer") options.prefer = value;
      continue;
    }
    if (argument === "--skip-install") options.skipInstall = true;
    else if (argument === "--skip-user-config") options.skipUserConfig = true;
    else if (argument === "--skip-build") options.skipBuild = true;
    else if (argument === "--skip-git-hooks") options.skipGitHooks = true;
    else if (argument === "--strict-build") options.strictBuild = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--verbose") options.verbose = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`);
    else positional.push(argument);
  }

  if (positional.length > 1) throw new Error("Provide at most one positional repository path.");
  if (options.repoPath && positional.length) throw new Error("Use either [repo-path] or --repo, not both.");
  options.repoPath ??= positional[0] ?? process.cwd();
  if (!["auto", "uv", "pipx", "pip"].includes(options.prefer)) {
    throw new Error("--prefer must be uv, pipx, pip, or auto.");
  }
  return options;
}

function log(level, message) {
  console.log(`[${level}] ${message}`);
}

function redact(text) {
  return String(text).replace(/((?:api[_-]?key|token|secret|password)\s*[=:]\s*)[^\s'"`]+/giu, "$1[redacted]");
}

function displayCommand(command, args) {
  return [command, ...args].map((part) => (/\s/u.test(part) ? JSON.stringify(part) : part)).join(" ");
}

function run(command, args, { cwd, dryRun, verbose, allowFailure = false } = {}) {
  const rendered = displayCommand(command, args);
  if (dryRun) {
    log("dry-run", `Would run: ${rendered}`);
    return { ok: true, status: 0, stdout: "", stderr: "", dryRun: true };
  }
  if (verbose) log("info", `Running: ${rendered}`);
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "pipe", windowsHide: true });
  // Some sandboxed Node runtimes report a benign spawn error alongside a
  // successful exit status. A real spawn failure has no exit status.
  if (result.error && result.status === null) {
    if (verbose) log("warn", `${rendered}: ${redact(result.error.message)}`);
    return { ok: false, status: result.status ?? 1, stdout: "", stderr: result.error.message };
  }
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (verbose && stdout.trim()) console.log(redact(stdout.trimEnd()));
  if (verbose && stderr.trim()) console.error(redact(stderr.trimEnd()));
  const ok = result.status === 0;
  if (!ok && !allowFailure && verbose) log("warn", `Command failed (${result.status}): ${rendered}`);
  return { ok, status: result.status ?? 1, stdout, stderr };
}

function tryRun(command, args, options) {
  return run(command, args, { ...options, allowFailure: true });
}

function commandExists(command) {
  const locator = process.platform === "win32" ? "where" : "which";
  return spawnSync(locator, [command], { stdio: "ignore", windowsHide: true }).status === 0;
}

function addCommonToolPaths() {
  const home = os.homedir();
  const additions = [path.join(home, ".local", "bin")];
  for (const version of ["3.13", "3.12", "3.11"]) {
    additions.push(path.join(home, "Library", "Python", version, "bin"));
    additions.push(path.join(home, "AppData", "Roaming", "Python", `Python${version.replace(".", "")}`, "Scripts"));
    additions.push(path.join(home, "AppData", "Local", "Programs", "Python", `Python${version.replace(".", "")}`, "Scripts"));
  }
  addToolPaths(additions);
}

function addToolPaths(additions) {
  const existing = (process.env.PATH ?? "").split(path.delimiter);
  process.env.PATH = [...additions.filter((entry) => entry && !existing.includes(entry)), ...existing].join(path.delimiter);
}

function findPythonCandidates() {
  return [
    { command: "python3", prefix: [] },
    { command: "python", prefix: [] },
    { command: "py", prefix: ["-3"] }
  ].filter((candidate) => commandExists(candidate.command) && isPython3(candidate));
}

function isPython3(candidate) {
  const result = spawnSync(candidate.command, [...candidate.prefix, "--version"], {
    encoding: "utf8",
    stdio: "pipe",
    windowsHide: true
  });
  return result.status === 0 && /Python 3\./u.test(`${result.stdout ?? ""}${result.stderr ?? ""}`);
}

function pythonLabel(python) {
  return displayCommand(python.command, python.prefix);
}

function resultMessage(result) {
  return redact((result.stderr || result.stdout || "unknown failure").trim().split(/\r?\n/u)[0]);
}

function makeGraphifyCommandRunner(pythons, dryRun = false) {
  if (commandExists("graphify")) return { command: "graphify", prefix: [], source: "CLI" };
  if (dryRun) return undefined;
  for (const python of pythons) {
    const probe = tryRun(python.command, [...python.prefix, "-m", "graphify", "--help"], { dryRun: false });
    if (probe.ok) {
      log("warn", `Graphify is available only as ${pythonLabel(python)} -m graphify; add its Scripts/bin directory to PATH when convenient.`);
      return { command: python.command, prefix: [...python.prefix, "-m", "graphify"], source: "Python module fallback" };
    }
  }
  return undefined;
}

function graphifyArgs(runner, args) {
  return [...runner.prefix, ...args];
}

function packageSpec(extras) {
  const normalized = extras.trim();
  return normalized ? `${GRAPHIFY_PACKAGE}[${normalized}]` : GRAPHIFY_PACKAGE;
}

function selectPythonWithPip(pythons, options) {
  for (const python of pythons) {
    if (tryRun(python.command, [...python.prefix, "-m", "pip", "--version"], options).ok) return python;
  }
  for (const python of pythons) {
    log("warn", `${pythonLabel(python)} does not provide pip; trying its standard-library ensurepip bootstrap.`);
    const ensured = tryRun(python.command, [...python.prefix, "-m", "ensurepip", "--user"], options);
    if (ensured.ok && tryRun(python.command, [...python.prefix, "-m", "pip", "--version"], options).ok) {
      log("ok", `Bootstrapped pip for ${pythonLabel(python)}.`);
      return python;
    }
    log("warn", `Could not bootstrap pip with ${pythonLabel(python)}: ${resultMessage(ensured)}`);
  }
  return undefined;
}

function addPythonUserToolPath(python, options) {
  if (!python) return;
  const result = tryRun(python.command, [...python.prefix, "-m", "site", "--user-base"], options);
  if (!result.ok) return;
  const userBase = result.stdout.trim().split(/\r?\n/u).pop();
  if (!userBase) return;
  addToolPaths([path.join(userBase, process.platform === "win32" ? "Scripts" : "bin")]);
}

function installGraphify({ options, pythons }) {
  const spec = packageSpec(options.extras);
  const installers = options.prefer === "auto"
    ? ["uv", "pipx", "pip"]
    : [options.prefer, ...["uv", "pipx", "pip"].filter((tool) => tool !== options.prefer)];

  for (const installer of installers) {
    if (installer === "uv") {
      if (!commandExists("uv")) {
        log("warn", "uv is not available; trying the next Graphify installer.");
        continue;
      }
      log("info", `Installing ${spec} with uv.`);
      const upgraded = tryRun("uv", ["tool", "install", "--upgrade", spec], options);
      if (!upgraded.ok && !options.dryRun) tryRun("uv", ["tool", "install", spec], options);
    } else if (installer === "pipx") {
      if (!commandExists("pipx")) {
        log("warn", "pipx is not available; trying the next Graphify installer.");
        continue;
      }
      log("info", `Installing ${spec} with pipx.`);
      const installed = tryRun("pipx", ["install", spec], options);
      if (!installed.ok && !options.dryRun) tryRun("pipx", ["upgrade", GRAPHIFY_PACKAGE], options);
    } else {
      if (!pythons.length) throw new Error("Python 3 is required to install Graphify, but no Python interpreter was found.");
      const python = selectPythonWithPip(pythons, options);
      if (!python) {
        throw new Error("No available Python interpreter has pip, and ensurepip could not bootstrap it. Install Python with pip, install uv or pipx, then rerun this script.");
      }
      log("info", `Installing ${spec} with pip --user.`);
      const installed = tryRun(python.command, [...python.prefix, "-m", "pip", "install", "--user", "--upgrade", spec], options);
      if (!installed.ok) {
        throw new Error(`Graphify installation with ${pythonLabel(python)} -m pip failed: ${resultMessage(installed)}`);
      }
      addPythonUserToolPath(python, options);
    }

    if (options.dryRun || commandExists("graphify")) return;
  }
}

function readTextIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : undefined;
}

function writeText(filePath, content, options, changedFiles) {
  const existing = readTextIfExists(filePath);
  if (existing === content) return false;
  const relative = path.relative(options.repoRoot, filePath) || filePath;
  if (options.dryRun) {
    log("dry-run", `Would ${existing === undefined ? "create" : "update"}: ${relative}`);
  } else {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
    log("ok", `${existing === undefined ? "Created" : "Updated"}: ${relative}`);
  }
  changedFiles.add(relative);
  return true;
}

function ensureDir(directory, options, changedFiles) {
  if (fs.existsSync(directory)) return;
  const relative = path.relative(options.repoRoot, directory) || directory;
  if (options.dryRun) log("dry-run", `Would create directory: ${relative}`);
  else {
    fs.mkdirSync(directory, { recursive: true });
    log("ok", `Created directory: ${relative}`);
  }
  changedFiles.add(`${relative}/`);
}

function ensureLine(filePath, line, options, changedFiles) {
  const existing = readTextIfExists(filePath) ?? "";
  const lines = existing.split(/\r?\n/u);
  const withoutDuplicates = lines.filter((entry) => entry.trim() !== line);
  while (withoutDuplicates.length && withoutDuplicates[withoutDuplicates.length - 1] === "") withoutDuplicates.pop();
  withoutDuplicates.push(line);
  return writeText(filePath, `${withoutDuplicates.join("\n")}\n`, options, changedFiles);
}

function upsertMarkedBlock(filePath, startMarker, endMarker, blockText, options, changedFiles) {
  const existing = readTextIfExists(filePath) ?? "";
  const start = existing.indexOf(startMarker);
  const end = existing.indexOf(endMarker);
  if ((start === -1) !== (end === -1) || (start !== -1 && end < start)) {
    log("warn", `Could not safely update ${path.relative(options.repoRoot, filePath)} because its Graphify markers are incomplete. Resolve the existing marked block manually.`);
    return false;
  }
  const next = start === -1
    ? `${existing.replace(/\s*$/u, "")}${existing.trim() ? "\n\n" : ""}${blockText}`
    : `${existing.slice(0, start)}${blockText}${existing.slice(end + endMarker.length).replace(/^\r?\n/u, "")}`;
  return writeText(filePath, next, options, changedFiles);
}

function detectIgnoredGraphifyOut(gitignoreText) {
  return gitignoreText.split(/\r?\n/u).some((line) => {
    const rule = line.trim();
    return !rule.startsWith("#") && /^(?:\/)?graphify-out\/?(?:\*\*)?\/?$/u.test(rule);
  });
}

function updateTomlFeatureFlags(configText, flags) {
  const lines = configText.split(/\r?\n/u);
  const sectionIndexes = lines
    .map((line, index) => (/^\s*\[features\]\s*(?:#.*)?$/u.test(line) ? index : -1))
    .filter((index) => index !== -1);
  if (sectionIndexes.length > 1 || (!sectionIndexes.length && lines.some((line) => /^\s*features\s*=/u.test(line)))) {
    return { safe: false, content: configText };
  }
  if (!sectionIndexes.length) {
    const suffix = configText.trimEnd();
    return { safe: true, content: `${suffix}${suffix ? "\n\n" : ""}[features]\n${Object.entries(flags).map(([key, value]) => `${key} = ${value}`).join("\n")}\n` };
  }
  const start = sectionIndexes[0];
  const end = lines.findIndex((line, index) => index > start && /^\s*\[[^\]]+\]/u.test(line));
  const stop = end === -1 ? lines.length : end;
  const found = new Set();
  for (let index = start + 1; index < stop; index += 1) {
    for (const [key, value] of Object.entries(flags)) {
      const match = lines[index].match(new RegExp(`^(\\s*)${key}\\s*=\\s*[^#\\r\\n]*(\\s*(?:#.*)?)$`, "u"));
      if (match) {
        lines[index] = `${match[1]}${key} = ${value}${match[2]}`;
        found.add(key);
      }
    }
  }
  const missing = Object.entries(flags).filter(([key]) => !found.has(key));
  if (missing.length) lines.splice(stop, 0, ...missing.map(([key, value]) => `${key} = ${value}`));
  return { safe: true, content: `${lines.join("\n").replace(/\n*$/u, "")}\n` };
}

function updateUserConfig(options, changedFiles) {
  if (options.skipUserConfig) return "skipped";
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const configPath = path.join(codexHome, "config.toml");
  ensureDir(codexHome, options, changedFiles);
  const current = readTextIfExists(configPath) ?? "";
  const updated = updateTomlFeatureFlags(current, { hooks: "true", multi_agent: "true" });
  if (!updated.safe) {
    const startMarker = "# BEGIN GRAPHIFY CODEX FEATURE FLAGS";
    const endMarker = "# END GRAPHIFY CODEX FEATURE FLAGS";
    const guidance = `${startMarker}\n# Existing unusual or duplicate features configuration was preserved.\n# Add these settings manually under the existing [features] table:\n# hooks = true\n# multi_agent = true\n${endMarker}\n`;
    const start = current.indexOf(startMarker);
    const end = current.indexOf(endMarker);
    const fallback = start !== -1 && end >= start
      ? `${current.slice(0, start)}${guidance}${current.slice(end + endMarker.length).replace(/^\r?\n/u, "")}`
      : `${current.trimEnd()}${current.trim() ? "\n\n" : ""}${guidance}`;
    writeText(configPath, fallback, options, changedFiles);
    log("warn", `Could not safely update ${configPath}; it has unusual or duplicate features configuration. Appended marked manual guidance instead.`);
    return "warning";
  }
  writeText(configPath, updated.content, options, changedFiles);
  return "updated";
}

function installCodexIntegration(runner, options) {
  const projectCommands = [
    ["graphify install --project --platform codex", ["install", "--project", "--platform", "codex"]],
    ["graphify codex install --project", ["codex", "install", "--project"]]
  ];
  const fallbackCommands = [
    ["graphify install --platform codex", ["install", "--platform", "codex"], "user-scoped/older compatibility fallback"],
    ["graphify codex install", ["codex", "install"], "user-scoped/older compatibility fallback"],
    ["graphify install --project --platform agents", ["install", "--project", "--platform", "agents"], "older project-scoped agents compatibility fallback"],
    ["graphify agents install --project", ["agents", "install", "--project"], "older project-scoped agents compatibility fallback"]
  ];
  const succeeded = [];
  let projectSuccess = false;
  for (const [label, args] of projectCommands) {
    const result = tryRun(runner.command, graphifyArgs(runner, args), options);
    if (result.ok) {
      succeeded.push(label);
      projectSuccess = true;
    }
  }
  if (!projectSuccess) {
    log("warn", "Project-scoped Codex integration commands failed; trying compatibility fallbacks.");
    for (const [label, args, note] of fallbackCommands) {
      log("warn", `Trying ${note}: ${label}`);
      const result = tryRun(runner.command, graphifyArgs(runner, args), options);
      if (result.ok) succeeded.push(label);
    }
  }
  return { succeeded, projectSuccess };
}

function buildGraph(runner, options) {
  if (options.skipBuild) return "skipped";
  const graphExists = fs.existsSync(path.join(options.repoRoot, "graphify-out", "graph.json"));
  const args = graphExists ? [".", "--update"] : ["."];
  const result = tryRun(runner.command, graphifyArgs(runner, args), options);
  if (!result.ok) {
    const message = "Graph build/update failed. This often means Graphify needs a model, backend, or API configuration.";
    if (options.strictBuild) throw new Error(message);
    log("warn", `${message} Continuing because --strict-build was not set.`);
    return "failed";
  }
  if (options.dryRun) return "planned";
  const graph = path.join(options.repoRoot, "graphify-out", "graph.json");
  const report = path.join(options.repoRoot, "graphify-out", "GRAPH_REPORT.md");
  log(fs.existsSync(graph) ? "ok" : "warn", `${fs.existsSync(graph) ? "Confirmed" : "Did not find"}: graphify-out/graph.json`);
  log(fs.existsSync(report) ? "ok" : "warn", `${fs.existsSync(report) ? "Confirmed" : "Did not find"}: graphify-out/GRAPH_REPORT.md`);
  return "succeeded";
}

function installHooks(runner, options) {
  if (options.skipGitHooks) return "skipped";
  const result = tryRun(runner.command, graphifyArgs(runner, ["hook", "install"]), options);
  if (!result.ok) {
    log("warn", "Graphify git hook installation failed; continue without hooks or run it manually after resolving Graphify setup.");
    return "failed";
  }
  return options.dryRun ? "planned" : "installed";
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  if (Number.parseInt(process.versions.node.split(".")[0], 10) < 18) {
    throw new Error(`Node.js 18+ is required; found ${process.versions.node}.`);
  }
  addCommonToolPaths();
  if (!commandExists("git")) throw new Error("git is required to find the repository root, but it was not found on PATH.");

  const requestedPath = path.resolve(options.repoPath);
  const gitRoot = run("git", ["rev-parse", "--show-toplevel"], { cwd: requestedPath, verbose: options.verbose });
  if (!gitRoot.ok) {
    throw new Error(`No Git repository found from ${requestedPath}. Graphify git hooks and Codex repo setup require a Git repository.`);
  }
  options.repoRoot = path.resolve(gitRoot.stdout.trim());
  options.cwd = options.repoRoot;
  log("info", `Using Git repository: ${options.repoRoot}`);

  const changedFiles = new Set();
  const pythons = findPythonCandidates();
  let runner = makeGraphifyCommandRunner(pythons, options.dryRun);
  let graphifyStatus = runner ? `found (${runner.source})` : "not found";
  if (!runner) {
    if (options.skipInstall && !options.dryRun) {
      throw new Error("Graphify is unavailable and --skip-install was set. Install graphifyy or remove --skip-install.");
    }
    if (options.dryRun) {
      log("dry-run", options.skipInstall
        ? "Graphify is not currently found; dry-run will only show the setup it would require."
        : `Graphify is not currently found; would install ${packageSpec(options.extras)}.`);
      runner = { command: "graphify", prefix: [], source: "planned CLI" };
      graphifyStatus = options.skipInstall ? "not found (dry-run)" : "planned installation";
    } else {
      installGraphify({ options, pythons });
      addCommonToolPaths();
      runner = makeGraphifyCommandRunner(pythons);
      if (!runner) throw new Error("Graphify remains unavailable after installation. Ensure graphifyy installed successfully and its bin/Scripts directory is on PATH.");
      graphifyStatus = `installed (${runner.source})`;
    }
  } else if (!options.skipInstall) {
    log("info", "Graphify is already available; leaving the installed version unchanged.");
  }

  const graphifyIgnorePath = path.join(options.repoRoot, ".graphifyignore");
  if (readTextIfExists(graphifyIgnorePath) === undefined) writeText(graphifyIgnorePath, GRAPHIFY_IGNORE_DEFAULT, options, changedFiles);
  else log("info", "Preserved existing .graphifyignore.");

  const gitignorePath = path.join(options.repoRoot, ".gitignore");
  const originalGitignore = readTextIfExists(gitignorePath) ?? "";
  if (detectIgnoredGraphifyOut(originalGitignore)) {
    log("warn", ".gitignore appears to ignore all graphify-out/. Team reuse works best when graphify-out/ is committed, while graphify-out/cost.json remains ignored.");
  }
  ensureLine(gitignorePath, COST_IGNORE_LINE, options, changedFiles);

  const agentsUpdated = upsertMarkedBlock(path.join(options.repoRoot, "AGENTS.md"), POLICY_START, POLICY_END, GRAPHIFY_POLICY, options, changedFiles);
  const userConfigStatus = updateUserConfig(options, changedFiles);
  const integration = installCodexIntegration(runner, options);
  if (!integration.projectSuccess && !agentsUpdated) {
    log("warn", "No project-scoped Graphify integration command succeeded and AGENTS.md could not be updated. Add the Graphify policy manually before relying on Graphify-first behavior.");
  }
  const buildStatus = buildGraph(runner, options);
  const hookStatus = installHooks(runner, options);

  console.log("\nSummary:");
  console.log(`  Repo root: ${options.repoRoot}`);
  console.log(`  Graphify: ${graphifyStatus}`);
  console.log(`  Codex integration commands: ${integration.succeeded.length ? `${options.dryRun ? "planned" : "succeeded"} (${integration.succeeded.join("; ")})` : "none succeeded (AGENTS.md policy is still installed when safe)"}`);
  console.log(`  Files ${options.dryRun ? "to create/update" : "created/updated"}: ${changedFiles.size ? [...changedFiles].join(", ") : "none"}`);
  console.log(`  User config: ${userConfigStatus}`);
  console.log(`  Graph build/update: ${buildStatus}`);
  console.log(`  Git hooks: ${hookStatus}`);
  console.log(`\nRecommended files to review and commit:
  AGENTS.md
  .agents/
  .codex/
  .graphifyignore
  .gitignore
  graphify-out/

Do not commit:
  graphify-out/cost.json

Codex trust step:
  Open Codex in this repository. If Codex reports untrusted project hooks, run /hooks and review/trust the Graphify hook.
  Restart Codex after setup so it reloads AGENTS.md, skills, and hooks.

Validation commands:
  graphify hook status
  graphify query "summarize this repository architecture" --graph graphify-out/graph.json
  codex --ask-for-approval never "List the instruction sources and hooks you loaded. Confirm whether Graphify-first guidance is active."`);
}

try {
  main();
} catch (error) {
  log("error", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
