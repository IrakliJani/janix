import { execSync, spawn, spawnSync } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import { pathExists } from "./fs.js";

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

export function runScriptsOnHost(scripts: string[], cwd: string): void {
  for (const script of scripts) {
    const result = spawnSync(script, { cwd, stdio: "inherit", shell: true });
    if (result.status !== 0) {
      throw new Error(`Script failed: ${script}`);
    }
  }
}

export async function addToGitignore(projectRoot: string, line: string): Promise<boolean> {
  const gitignorePath = join(projectRoot, ".gitignore");
  const exists = await pathExists(gitignorePath);

  if (exists) {
    const content = await readFile(gitignorePath, "utf-8");
    if (content.includes(line)) {
      return false;
    }
  }

  const newLine = exists ? `\n${line}\n` : `${line}\n`;
  await appendFile(gitignorePath, newLine);
  return true;
}

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
