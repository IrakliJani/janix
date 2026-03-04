import { execSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

/**
 * Run scripts in the container inside nix develop (for access to flake devShell packages).
 */
export function runScriptsInDevShell(
  scripts: string[],
  containerName: string,
  env: Record<string, string> = {},
): Promise<void> {
  if (scripts.length === 0) return Promise.resolve();

  const envArgs = Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
  const batchScript = `set -e\n${scripts.join("\n")}`;

  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-w",
        config.containerWorkspace,
        ...envArgs,
        containerName,
        "nix",
        "develop",
        "/flake",
        "--command",
        "bash",
        "-c",
        batchScript,
      ],
      { stdio: "inherit" },
    );

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Scripts failed with exit code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Add a line to .gitignore if not already present.
 */
export function addToGitignore(projectRoot: string, line: string): boolean {
  const gitignorePath = join(projectRoot, ".gitignore");

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    if (content.includes(line)) {
      return false; // Already present
    }
  }

  const newLine = existsSync(gitignorePath) ? `\n${line}\n` : `${line}\n`;
  appendFileSync(gitignorePath, newLine);
  return true;
}

/**
 * Get the current git branch name.
 */
export function getCurrentBranch(repoPath: string): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: repoPath,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
    }).trim();
  } catch {
    return "main";
  }
}

/**
 * Check if current directory is a git repository.
 */
export function isGitRepo(path: string): boolean {
  try {
    execSync("git rev-parse --git-dir", {
      cwd: path,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}
