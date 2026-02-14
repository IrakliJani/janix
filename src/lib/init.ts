import { execSync, spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getProjectRoot } from "./config.js";

/**
 * Copy files from project root to clone directory.
 */
export function copyFilesToClone(files: string[], clonePath: string): void {
  const projectRoot = getProjectRoot();

  for (const file of files) {
    const sourcePath = join(projectRoot, file);
    const destPath = join(clonePath, file);

    if (!existsSync(sourcePath)) {
      console.log(`  Skipping ${file} (not found)`);
      continue;
    }

    // Ensure destination directory exists
    const destDir = dirname(destPath);
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    copyFileSync(sourcePath, destPath);
    console.log(`  Copied ${file}`);
  }
}

/**
 * Run init scripts in the container.
 */
export function runInitScripts(scripts: string[], containerName: string): void {
  for (const script of scripts) {
    console.log(`Running ${script}...`);

    const result = spawnSync("docker", ["exec", containerName, "bash", "-c", script], {
      stdio: "inherit",
    });

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
