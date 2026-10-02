#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function readInput() {
  try {
    const parsed = JSON.parse(readFileSync(0, "utf8") || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 3000,
  }).trim();
}

function repositoryRoot(cwd) {
  try {
    return git(cwd, ["rev-parse", "--show-toplevel"]);
  } catch {
    return null;
  }
}

function statePath(root) {
  const key = createHash("sha256").update(root).digest("hex");
  const directory = path.join(os.tmpdir(), "codex-merge-changelog");
  mkdirSync(directory, { recursive: true });
  return path.join(directory, `${key}.json`);
}

function readState(file) {
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function writeState(file, state) {
  writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
}

function clearState(file) {
  try {
    unlinkSync(file);
  } catch {
    // Missing state is already clear.
  }
}

function hasMergeInProgress(root) {
  try {
    git(root, ["rev-parse", "--verify", "-q", "MERGE_HEAD"]);
    return true;
  } catch {
    return false;
  }
}

function shellSegments(command) {
  const tokens = command.match(/&&|\|\||[;|\n]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s;&|\n]+/g) ?? [];
  const segments = [[]];
  for (const token of tokens) {
    if (["&&", "||", ";", "|", "\n"].includes(token)) segments.push([]);
    else segments.at(-1).push(unquote(token));
  }
  return segments.filter((segment) => segment.length > 0);
}

function unquote(word) {
  if ((word.startsWith('"') && word.endsWith('"')) || (word.startsWith("'") && word.endsWith("'"))) {
    return word.slice(1, -1);
  }
  return word;
}

function gitCommands(command, cwd, root) {
  const matches = [];
  for (const words of shellSegments(command)) {
    for (let index = 0; index < words.length; index += 1) {
      if (!/(?:^|\/)git$/.test(words[index])) continue;
      let cursor = index + 1;
      let commandCwd = cwd;
      let validTarget = true;
      while (cursor < words.length) {
        if (words[cursor] === "-C" && words[cursor + 1]) {
          commandCwd = path.resolve(commandCwd, words[cursor + 1]);
          cursor += 2;
        } else if (words[cursor] === "-c" && words[cursor + 1]) {
          cursor += 2;
        } else if (words[cursor].startsWith("-c") && words[cursor].length > 2) {
          cursor += 1;
        } else if (words[cursor].startsWith("-")) {
          cursor += 1;
        } else {
          break;
        }
      }
      try {
        if (repositoryRoot(commandCwd) !== root) validTarget = false;
      } catch {
        validTarget = false;
      }
      if (validTarget && cursor < words.length) {
        matches.push({ subcommand: words[cursor], args: words.slice(cursor + 1), cwd: commandCwd });
      }
    }
  }
  return matches;
}

function branchStartPoint(invocation) {
  if (invocation.subcommand !== "checkout" && invocation.subcommand !== "switch") return null;

  const separator = invocation.args.indexOf("--");
  const args = separator < 0 ? invocation.args : invocation.args.slice(0, separator);
  const createIndex = args.findIndex((argument) => ["-b", "-B", "-c", "-C", "--branch"].includes(argument));
  if (createIndex >= 0) {
    const branchNameIndex = createIndex + 1;
    for (let index = branchNameIndex + 1; index < args.length; index += 1) {
      if (!args[index].startsWith("-")) return args[index];
    }
    return null;
  }

  if (args.includes("-")) return "@{-1}";
  return args.find((argument) => !argument.startsWith("-")) ?? null;
}

function mergeBaseBeforeCommand(root, invocations, mergeInvocation, currentHead) {
  const mergeIndex = invocations.indexOf(mergeInvocation);
  let mergeBase = currentHead;
  for (const invocation of invocations.slice(0, mergeIndex)) {
    const target = branchStartPoint(invocation);
    if (!target) continue;
    try {
      mergeBase = git(invocation.cwd ?? root, ["rev-parse", "--verify", `${target}^{commit}`]);
    } catch {
      // A newly created branch without a start point begins at the current HEAD.
    }
  }
  return mergeBase;
}

function switchesBranchBeforeMerge(invocations, mergeInvocation) {
  const mergeIndex = invocations.indexOf(mergeInvocation);
  return invocations
    .slice(0, mergeIndex)
    .some((invocation) => branchStartPoint(invocation) !== null);
}

function emitsChangelogEntry(root, state, currentHead) {
  if (!state.squash) return true;
  try {
    const [parents, tree] = git(root, ["show", "-s", "--format=%P%n%T", currentHead]).split("\n");
    if (state.sameCallSquashCommit) {
      return parents === state.before && (!state.indexTreeBefore || tree !== state.indexTreeBefore);
    }
    if (state.expectedTree) return parents === state.before && tree === state.expectedTree;
    // For a conflicted squash, write-tree cannot capture the expected tree until conflict resolution.
    return parents === state.before;
  } catch {
    return false;
  }
}

function emitContext(context) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: context,
    },
  }));
}

const phase = process.argv[2];
const input = readInput();
const cwd = typeof input.cwd === "string" ? path.resolve(input.cwd) : process.cwd();
const root = repositoryRoot(cwd);
if (!root) process.exit(0);
const command = typeof input.tool_input?.command === "string" ? input.tool_input.command : "";
const toolUseId = typeof input.tool_use_id === "string" ? input.tool_use_id : "";
const file = statePath(root);
const gitInvocations = gitCommands(command, cwd, root);
const mergeInvocation = gitInvocations.find((entry) => ["merge", "pull"].includes(entry.subcommand));

if (phase === "pre") {
  if (!mergeInvocation || !toolUseId) process.exit(0);
  try {
    const currentHead = git(root, ["rev-parse", "HEAD"]);
    const before = mergeBaseBeforeCommand(root, gitInvocations, mergeInvocation, currentHead);
    let indexTreeBefore = null;
    if (switchesBranchBeforeMerge(gitInvocations, mergeInvocation)) {
      try {
        // The hook runs before the command, so after a branch switch the original index is stale.
        indexTreeBefore = git(root, ["rev-parse", "--verify", `${before}^{tree}`]);
      } catch {
        // An unresolved destination cannot provide a reliable squash baseline.
      }
    } else {
      try {
        indexTreeBefore = git(root, ["write-tree"]);
      } catch {
        // A pre-existing unmerged index cannot be snapshotted.
      }
    }
    writeState(file, {
      before,
      indexTreeBefore,
      initialToolUseId: toolUseId,
      integration: mergeInvocation.subcommand,
      squash: mergeInvocation.args.includes("--squash"),
      sameCallSquashCommit:
        mergeInvocation.args.includes("--squash") &&
        gitInvocations.some((entry) => entry.subcommand === "commit"),
      phase: "initial",
    });
  } catch {
    clearState(file);
  }
  process.exit(0);
}

if (phase !== "post") process.exit(0);
const state = readState(file);
if (!state) process.exit(0);
const isInitialEvent = toolUseId && toolUseId === state.initialToolUseId;
const mergeAbort = gitInvocations.some((entry) => entry.subcommand === "merge" && entry.args.includes("--abort"));
const resetAbort = gitInvocations.some(
  (entry) => entry.subcommand === "reset" && (entry.args.includes("--merge") || entry.args.includes("--hard")),
);
const commitCommand = gitInvocations.some((entry) => entry.subcommand === "commit");

// Do not let unrelated or parallel Bash tool completions consume another merge's state.
if (state.phase === "initial" && !isInitialEvent) process.exit(0);
if (!isInitialEvent && !mergeAbort && !resetAbort && !(state.phase === "pending" && commitCommand)) process.exit(0);

let currentHead;
try {
  currentHead = git(root, ["rev-parse", "HEAD"]);
} catch {
  process.exit(0);
}
if ((mergeAbort || resetAbort) && currentHead === state.before) {
  clearState(file);
  process.exit(0);
}
if (hasMergeInProgress(root)) {
  state.phase = "pending";
  state.initialToolUseId = null;
  writeState(file, state);
  process.exit(0);
}

if (currentHead === state.before) {
  if (state.squash) {
    try {
      const currentTree = git(root, ["write-tree"]);
      if (state.indexTreeBefore === currentTree) {
        clearState(file);
        process.exit(0);
      }
      state.expectedTree = currentTree;
      state.phase = "pending";
      state.initialToolUseId = null;
      writeState(file, state);
      process.exit(0);
    } catch {
      // A squash conflict leaves unmerged index entries, so keep watching for resolution and commit.
      try {
        if (git(root, ["ls-files", "-u"])) {
          state.phase = "pending";
          state.initialToolUseId = null;
          writeState(file, state);
          process.exit(0);
        }
      } catch {
        // Nothing indicates an active squash operation.
      }
    }
  }
  clearState(file);
  process.exit(0);
}

if (!state.squash && state.phase === "pending") {
  try {
    const parents = git(root, ["show", "-s", "--format=%P", currentHead]).split(/\s+/).filter(Boolean);
    if (parents.length < 2 || parents[0] !== state.before) {
      clearState(file);
      process.exit(0);
    }
  } catch {
    clearState(file);
    process.exit(0);
  }
}

if (!state.squash && state.integration === "pull" && state.phase !== "pending") {
  try {
    git(root, ["merge-base", "--is-ancestor", state.before, currentHead]);
  } catch {
    // A pull that rebased local commits did not add commits by merging or fast-forwarding.
    clearState(file);
    process.exit(0);
  }
}

if (!emitsChangelogEntry(root, state, currentHead)) {
  clearState(file);
  process.exit(0);
}

let commits;
try {
  commits = state.squash
    ? git(root, ["show", "-s", "--format=%h%x09%s", currentHead])
    : git(root, ["log", "--reverse", "--format=%h%x09%s", `${state.before}..${currentHead}`]);
} catch {
  clearState(file);
  process.exit(0);
}
clearState(file);
if (!commits) process.exit(0);

const date = new Date().toISOString().slice(0, 10);
emitContext([
  "A Git merge or pull integration has completed. Update the repository root CHANGELOG.md now.",
  `Use a new top entry dated ${date}, with a concise human-readable title and a 1–3 sentence summary based on the merged diff.`,
  `List every introduced commit below the summary using its short hash and subject. Include this exact hidden deduplication marker in the entry: <!-- merge-sha: ${currentHead} -->. Check for this marker before adding; if already present, do not duplicate the entry.`,
  "Commits:",
  ...commits.split("\n").map((line) => `- ${line.replace("\t", " — ")}`),
].join("\n"));
