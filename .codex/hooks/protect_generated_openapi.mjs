#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const patchPathPatterns = [
  /^\*\*\* (?:Update|Add|Delete) File: (.+?)\s*$/,
  /^\*\*\* Move to: (.+?)\s*$/,
  /^\+\+\+ (?:b\/)?(.+?)\s*$/,
];

function readInput() {
  try {
    const parsed = JSON.parse(readFileSync(0, "utf8") || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function patchedPaths(patch) {
  const paths = [];
  for (const line of patch.split(/\r?\n/)) {
    for (const pattern of patchPathPatterns) {
      const match = line.match(pattern);
      if (match) {
        paths.push(match[1]);
        break;
      }
    }
  }
  return paths;
}

function isInside(candidatePath, directoryPath) {
  const relativePath = path.relative(directoryPath, candidatePath);
  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
}

const input = readInput();
if (input.tool_name !== "apply_patch") process.exit(0);

const patch = input.tool_input?.command;
if (typeof patch !== "string") process.exit(0);

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..", "..");
const generatedDirectory = path.join(repositoryRoot, "contract", "openapi");

const changesGeneratedOpenApi = patchedPaths(patch).some((rawPath) => {
  const normalized = rawPath.trim().replace(/\\/g, path.sep);
  if (!normalized || normalized === "/dev/null") return false;
  return isInside(path.resolve(repositoryRoot, normalized), generatedDirectory);
});

if (changesGeneratedOpenApi) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "OpenAPI files under contract/openapi/ are generated. Edit the TypeSpec source, then run `npm run compile` from contract/.",
      },
    }),
  );
}
