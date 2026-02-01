import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { getProjectRepo, getProjectClonesDir, getClonePath } from "./config.js";

function runGit(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    encoding: "utf-8",
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

export function fetchAll(project: string): void {
  runGit(["fetch", "--all", "--prune"], getProjectRepo(project));
}

export function listBranches(project: string): string[] {
  const output = runGit(["branch", "-a", "--format=%(refname:short)"], getProjectRepo(project));
  return output
    .split("\n")
    .filter((b) => b && !b.includes("HEAD"))
    .map((b) => b.replace("origin/", ""));
}

export function listLocalBranches(project: string): string[] {
  const output = runGit(["branch", "--format=%(refname:short)"], getProjectRepo(project));
  return output.split("\n").filter((b) => b);
}

export function listClones(project: string): Array<{ path: string; branch: string }> {
  const clonesDir = getProjectClonesDir(project);
  if (!existsSync(clonesDir)) return [];

  const clones: Array<{ path: string; branch: string }> = [];

  for (const dir of readdirSync(clonesDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const clonePath = `${clonesDir}/${dir.name}`;
    try {
      const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], clonePath);
      clones.push({ path: clonePath, branch });
    } catch {
      // Not a git repo, skip
    }
  }

  return clones;
}

export function cloneExists(project: string, branch: string): boolean {
  const clonePath = getClonePath(project, branch);
  return existsSync(clonePath);
}

export function createClone(project: string, branch: string): string {
  const clonePath = getClonePath(project, branch);
  const repoPath = getProjectRepo(project);

  if (existsSync(clonePath)) {
    console.log(`Clone already exists at ${clonePath}`);
    return clonePath;
  }

  // Ensure clones directory exists
  const clonesDir = getProjectClonesDir(project);
  if (!existsSync(clonesDir)) {
    mkdirSync(clonesDir, { recursive: true });
  }

  // Clone the repo
  runGit(["clone", repoPath, clonePath], clonesDir);

  // Checkout the branch
  const localBranches = listLocalBranches(project);
  const isLocal = localBranches.includes(branch);

  if (isLocal) {
    runGit(["checkout", branch], clonePath);
  } else {
    // Create local branch tracking remote
    runGit(["checkout", "-b", branch, `origin/${branch}`], clonePath);
  }

  return clonePath;
}

export function removeClone(project: string, branch: string): void {
  const clonePath = getClonePath(project, branch);
  if (existsSync(clonePath)) {
    rmSync(clonePath, { recursive: true, force: true });
  }
}

export function branchExists(project: string, branch: string): boolean {
  const repoPath = getProjectRepo(project);
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
