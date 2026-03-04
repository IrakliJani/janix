import { execFileSync, spawn } from "node:child_process";
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

export function fetchAllAsync(repoPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["fetch", "--all", "--prune"], {
      cwd: repoPath,
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git fetch failed with code ${code}`));
    });
    child.on("error", reject);
  });
}

export interface BranchInfo {
  name: string;
  author: string;
}

export function listBranches(repoPath: string): BranchInfo[] {
  // Sort by committerdate descending (most recent first), deduplicate by stripped name
  const output = runGit(
    [
      "for-each-ref",
      "--sort=-committerdate",
      "--format=%(refname)|%(authorname)",
      "refs/heads",
      "refs/remotes",
    ],
    repoPath,
  );
  const seen = new Set<string>();
  const branches: BranchInfo[] = [];
  for (const line of output.split("\n")) {
    if (!line || line.includes("HEAD")) continue;
    const [refname = "", author = ""] = line.split("|");
    let name: string;
    if (refname.startsWith("refs/heads/")) {
      name = refname.slice("refs/heads/".length);
    } else if (refname.startsWith("refs/remotes/")) {
      // Strip "refs/remotes/<remote>/" — remote name is the first path segment
      const withoutPrefix = refname.slice("refs/remotes/".length);
      name = withoutPrefix.slice(withoutPrefix.indexOf("/") + 1);
    } else {
      continue;
    }
    if (!seen.has(name)) {
      seen.add(name);
      branches.push({ name, author });
    }
  }
  return branches;
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

  // Try to checkout the branch
  // First check if it exists as a local branch (e.g., default branch)
  if (refExists(clonePath, `refs/heads/${branch}`)) {
    runGit(["checkout", branch], clonePath);
    return clonePath;
  }

  // Check if it exists in origin (the host repo)
  if (refExists(clonePath, `refs/remotes/origin/${branch}`)) {
    runGit(["checkout", "-b", branch, `origin/${branch}`, "--no-track"], clonePath);
    return clonePath;
  }

  // Fetch from origin in case it has new branches
  try {
    runGit(["fetch", "origin", branch], clonePath);
    runGit(["checkout", "-b", branch, "FETCH_HEAD", "--no-track"], clonePath);
    return clonePath;
  } catch {
    // Branch doesn't exist
  }

  throw new Error(`Could not checkout branch '${branch}' in clone`);
}

export function removeClone(branch: string): void {
  const clonePath = getClonePath(branch);
  if (existsSync(clonePath)) {
    rmSync(clonePath, { recursive: true, force: true });
  }
}

export function createBranch(repoPath: string, branch: string, base: string): void {
  runGit(["checkout", "-b", branch, base], repoPath);
  runGit(["checkout", "-"], repoPath);
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
