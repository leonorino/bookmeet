#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

function readInput() {
  let input = "";
  try {
    input = readFileSync(0, "utf8");
    const parsed = JSON.parse(input || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function repositoryRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    }).trim();
  } catch {
    return null;
  }
}

function readPackage(packageDirectory) {
  try {
    const packageJson = JSON.parse(
      readFileSync(path.join(packageDirectory, "package.json"), "utf8"),
    );
    if (!packageJson || typeof packageJson !== "object" || Array.isArray(packageJson)) {
      return null;
    }

    const scripts = packageJson.scripts;
    const commands =
      scripts && typeof scripts === "object" && !Array.isArray(scripts)
        ? Object.keys(scripts).map((name) => `npm run ${name}`)
        : [];
    return {
      name: String(packageJson.name || path.basename(packageDirectory)),
      commands,
    };
  } catch {
    return null;
  }
}

const input = readInput();
const cwd = typeof input.cwd === "string" ? path.resolve(input.cwd) : process.cwd();
const root = repositoryRoot(cwd);
if (!root) process.exit(0);

let packageDirectories;
try {
  packageDirectories = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
} catch {
  process.exit(0);
}

const packages = new Map();
for (const directory of packageDirectories) {
  const packageData = readPackage(path.join(root, directory));
  if (packageData) packages.set(directory, packageData);
}
if (packages.size === 0) process.exit(0);

const relativeCwd = path.relative(root, cwd);
const currentDirectory = relativeCwd.split(path.sep)[0];
const lines = [
  "Repository context: packages are independent; there is no root package.json.",
];

if (packages.has(currentDirectory)) {
  const currentPackage = packages.get(currentDirectory);
  lines.push(
    `Current package: ${currentDirectory}/ (${currentPackage.name}); run its scripts from this directory.`,
  );
  if (currentPackage.commands.length > 0) {
    lines.push(
      `Available scripts: ${currentPackage.commands.map((command) => `\`${command}\``).join(", ")}.`,
    );
  }
} else {
  lines.push("Package scripts:");
  for (const [directory, packageData] of packages) {
    const scripts =
      packageData.commands.map((command) => `\`${command}\``).join(", ") || "none";
    lines.push(`- ${directory}/ (${packageData.name}): ${scripts}; run them from this directory.`);
  }
}

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: lines.join("\n"),
    },
  }),
);
