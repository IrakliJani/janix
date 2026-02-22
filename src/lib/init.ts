import { execSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

/**
 * Run init scripts in the container.
 */
export function runInitScripts(
  scripts: string[],
  containerName: string,
  env: Record<string, string> = {},
): void {
  const envArgs = Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);

  for (const script of scripts) {
    console.log(`Running ${script}...`);

    // Run via nix develop so devShell packages (psql, node, etc.) are available.
    // For .sh files, explicitly invoke bash to avoid shebang interpreter issues in nix containers.
    const cmd = /\S+\.sh(\s|$)/.test(script) ? `bash ${script}` : script;
    const result = spawnSync(
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
        cmd,
      ],
      { stdio: "inherit" },
    );

    if (result.status !== 0) {
      console.error(`Script ${script} failed with exit code ${result.status}`);
      throw new Error(`Init script failed: ${script}`);
    }
  }
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
