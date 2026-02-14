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

  // Clone the repo (origin = project root for sandboxed pushes)
  runGit(["clone", repoPath, clonePath], clonesDir);

  // If the source repo has an origin remote, add it as upstream in the clone.
  // This allows checking out branches that exist only on the true upstream remote.
  try {
    const remoteUrl = runGit(["remote", "get-url", "origin"], repoPath);
    runGit(["remote", "add", "upstream", remoteUrl], clonePath);
    runGit(["fetch", "upstream"], clonePath);
  } catch {
    // Source repo has no origin remote; local branch checkout still works from clone origin.
  }

  // If branch exists locally in source repo, prefer clone-origin branch.
  const localBranches = listLocalBranches(repoPath);
  const isLocalInSource = localBranches.includes(branch);

  if (isLocalInSource) {
    if (refExists(clonePath, `refs/remotes/origin/${branch}`)) {
      runGit(["checkout", "-b", branch, `origin/${branch}`, "--no-track"], clonePath);
      return clonePath;
    }
    if (refExists(clonePath, `refs/heads/${branch}`)) {
      runGit(["checkout", branch], clonePath);
      return clonePath;
    }
  }

  // Branch from true upstream remote (no tracking - pushes go to clone origin).
  if (refExists(clonePath, `refs/remotes/upstream/${branch}`)) {
    runGit(["checkout", "-b", branch, `upstream/${branch}`, "--no-track"], clonePath);
    return clonePath;
  }

  // Fallback: branch available from clone origin.
  if (refExists(clonePath, `refs/remotes/origin/${branch}`)) {
    runGit(["checkout", "-b", branch, `origin/${branch}`, "--no-track"], clonePath);
    return clonePath;
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
