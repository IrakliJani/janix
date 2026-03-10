import { execFileSync, spawn } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import { getClonePath, getClonesDir, getProjectRoot } from "./config.js";
import { pathExists } from "./fs.js";

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

export async function listClones(): Promise<Array<{ name: string; path: string; branch: string }>> {
  const clonesDir = await getClonesDir();
  if (!(await pathExists(clonesDir))) return [];

  const clones: Array<{ name: string; path: string; branch: string }> = [];
  const entries = await readdir(clonesDir, { withFileTypes: true });

  for (const dir of entries) {
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

export async function cloneExists(branch: string): Promise<boolean> {
  return pathExists(await getClonePath(branch));
}

export async function createClone(branch: string): Promise<string> {
  const clonePath = await getClonePath(branch);
  const repoPath = await getProjectRoot();

  if (await pathExists(clonePath)) {
    console.log(`Clone already exists at ${clonePath}`);
    return clonePath;
  }

  const clonesDir = await getClonesDir();
  await mkdir(clonesDir, { recursive: true });

  runGit(["clone", repoPath, clonePath], clonesDir);

  if (refExists(clonePath, `refs/heads/${branch}`)) {
    runGit(["checkout", branch], clonePath);
    return clonePath;
  }

  if (refExists(clonePath, `refs/remotes/origin/${branch}`)) {
    runGit(["checkout", "-b", branch, `origin/${branch}`, "--no-track"], clonePath);
    return clonePath;
  }

  try {
    runGit(["fetch", "origin", branch], clonePath);
    runGit(["checkout", "-b", branch, "FETCH_HEAD", "--no-track"], clonePath);
    return clonePath;
  } catch {
    // Branch doesn't exist
  }

  throw new Error(`Could not checkout branch '${branch}' in clone`);
}

export async function removeClone(branch: string): Promise<void> {
  const clonePath = await getClonePath(branch);
  if (await pathExists(clonePath)) {
    await rm(clonePath, { recursive: true, force: true });
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
