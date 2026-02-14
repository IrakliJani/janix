import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { getClonesDir, getClonePath, getProjectRoot } from "./config.js";

function runGit(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    encoding: "utf-8",
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function refExists(repoPath: string, ref: string): boolean {
  try {
    runGit(["show-ref", "--verify", "--quiet", ref], repoPath);
    return true;
  } catch {
    return false;
  }
}

export function fetchAll(repoPath: string): void {
  runGit(["fetch", "--all", "--prune"], repoPath);
}

export function listBranches(repoPath: string): string[] {
  const output = runGit(["branch", "-a", "--format=%(refname:short)"], repoPath);
  return output
    .split("\n")
    .filter((b) => b && !b.includes("HEAD"))
    .map((b) => b.replace("origin/", ""));
}

export function listLocalBranches(repoPath: string): string[] {
  const output = runGit(["branch", "--format=%(refname:short)"], repoPath);
  return output.split("\n").filter((b) => b);
}

export function listClones(): Array<{ name: string; path: string; branch: string }> {
  const clonesDir = getClonesDir();
  if (!existsSync(clonesDir)) return [];

  const clones: Array<{ name: string; path: string; branch: string }> = [];

  for (const dir of readdirSync(clonesDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const clonePath = `${clonesDir}/${dir.name}`;
    try {
      const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], clonePath);
      clones.push({ name: dir.name, path: clonePath, branch });
    } catch {
      // Not a git repo, skip
    }
  }

  return clones;
}

export function cloneExists(branch: string): boolean {
  const clonePath = getClonePath(branch);
  return existsSync(clonePath);
}

export function createClone(branch: string): string {
  const clonePath = getClonePath(branch);
  const repoPath = getProjectRoot();

  if (existsSync(clonePath)) {
    console.log(`Clone already exists at ${clonePath}`);
    return clonePath;
  }

  // Ensure clones directory exists
  const clonesDir = getClonesDir();
  if (!existsSync(clonesDir)) {
    mkdirSync(clonesDir, { recursive: true });
  }

  // Clone from local repo (fast, uses hardlinks)
  runGit(["clone", repoPath, clonePath], clonesDir);

  // Get the real remote URL to fetch branches that only exist upstream
  let remoteUrl: string | null = null;
  try {
    remoteUrl = runGit(["remote", "get-url", "origin"], repoPath);
  } catch {
    // Source repo has no origin remote
  }

  // Add real remote as "upstream" for fetching remote-only branches
  if (remoteUrl) {
    runGit(["remote", "add", "upstream", remoteUrl], clonePath);
  }

  // Try to checkout the branch
  // First check if it exists as a local branch (e.g., default branch)
  if (refExists(clonePath, `refs/heads/${branch}`)) {
    runGit(["checkout", branch], clonePath);
    return clonePath;
  }

  // Check if it exists in origin (local repo's branches)
  if (refExists(clonePath, `refs/remotes/origin/${branch}`)) {
    runGit(["checkout", "-b", branch, `origin/${branch}`, "--no-track"], clonePath);
    return clonePath;
  }

  // Branch not in local clone - fetch only this branch from upstream
  if (remoteUrl) {
    try {
      runGit(["fetch", "upstream", `${branch}:refs/remotes/upstream/${branch}`], clonePath);
      runGit(["checkout", "-b", branch, `upstream/${branch}`, "--no-track"], clonePath);
      return clonePath;
    } catch {
      // Branch doesn't exist upstream either
    }
  }

  throw new Error(`Could not checkout branch '${branch}' in clone`);
}

export function removeClone(branch: string): void {
  const clonePath = getClonePath(branch);
  if (existsSync(clonePath)) {
    rmSync(clonePath, { recursive: true, force: true });
  }
}

export function branchExists(repoPath: string, branch: string): boolean {
  try {
    runGit(["rev-parse", "--verify", branch], repoPath);
    return true;
  } catch {
    try {
      runGit(["rev-parse", "--verify", `origin/${branch}`], repoPath);
      return true;
    } catch {
      return false;
    }
  }
}
