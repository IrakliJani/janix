import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getClonePath, getClonesDir, getProjectRoot, sanitizeBranchForClone } from "./config.js";
import { pathExists } from "./fs.js";

const CLONE_METADATA_FILE = ".janix-clone.json";

function runGit(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    encoding: "utf-8",
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

interface CloneMetadata {
  branch: string;
}

function isCloneMetadata(value: unknown): value is CloneMetadata {
  return (
    typeof value === "object" &&
    value !== null &&
    "branch" in value &&
    typeof value.branch === "string" &&
    value.branch.trim().length > 0
  );
}

async function readCloneMetadata(clonePath: string): Promise<CloneMetadata | null> {
  const metadataPath = join(clonePath, CLONE_METADATA_FILE);
  if (!(await pathExists(metadataPath))) {
    return null;
  }

  try {
    const content = await readFile(metadataPath, "utf-8");
    const parsed: unknown = JSON.parse(content);
    return isCloneMetadata(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function ensureCloneMetadata(clonePath: string, branch: string): Promise<void> {
  const metadata = await readCloneMetadata(clonePath);
  if (metadata?.branch) {
    return;
  }

  const metadataPath = join(clonePath, CLONE_METADATA_FILE);
  await writeFile(metadataPath, `${JSON.stringify({ branch }, null, 2)}\n`);
}

function getBranchFromRef(ref: string): string | null {
  if (ref.startsWith("refs/heads/")) {
    return ref.slice("refs/heads/".length);
  }

  if (ref.startsWith("refs/remotes/")) {
    const withoutPrefix = ref.slice("refs/remotes/".length);
    const slashIndex = withoutPrefix.indexOf("/");
    if (slashIndex === -1) {
      return null;
    }

    const branch = withoutPrefix.slice(slashIndex + 1);
    if (!branch || branch === "HEAD") {
      return null;
    }

    return branch;
  }

  return null;
}

function getMatchingBranchCandidates(clonePath: string, cloneName: string): string[] {
  const output = runGit(
    ["for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes"],
    clonePath,
  );
  if (!output) {
    return [];
  }

  const seen = new Set<string>();
  const matches: string[] = [];

  for (const line of output.split("\n")) {
    if (!line || line.includes("HEAD")) {
      continue;
    }

    const branch = getBranchFromRef(line);
    if (!branch || seen.has(branch)) {
      continue;
    }

    seen.add(branch);
    if (sanitizeBranchForClone(branch) === cloneName) {
      matches.push(branch);
    }
  }

  return matches;
}

function inferBranchFromCloneName(
  clonePath: string,
  cloneName: string,
  currentBranch: string,
): string {
  if (sanitizeBranchForClone(currentBranch) === cloneName) {
    return currentBranch;
  }

  const matches = getMatchingBranchCandidates(clonePath, cloneName);
  if (matches.length === 0) {
    return cloneName;
  }

  if (matches.length === 1) {
    const [onlyMatch] = matches;
    return onlyMatch ?? cloneName;
  }

  const slashMatches = matches.filter((branch) => branch.includes("/"));
  if (slashMatches.length === 1) {
    const [onlySlashMatch] = slashMatches;
    return onlySlashMatch ?? cloneName;
  }

  if (matches.includes(cloneName)) {
    return cloneName;
  }

  const [bestMatch] = matches.sort((a, b) => a.length - b.length || a.localeCompare(b));
  return bestMatch ?? cloneName;
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

export interface CloneInfo {
  name: string;
  path: string;
  branch: string;
  currentBranch: string;
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

export async function listClones(): Promise<CloneInfo[]> {
  const clonesDir = await getClonesDir();
  if (!(await pathExists(clonesDir))) {
    return [];
  }

  const clones: CloneInfo[] = [];
  const entries = await readdir(clonesDir, { withFileTypes: true });

  for (const dir of entries) {
    if (!dir.isDirectory()) {
      continue;
    }

    const clonePath = join(clonesDir, dir.name);
    try {
      const currentBranch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], clonePath);
      const metadata = await readCloneMetadata(clonePath);
      const branch =
        metadata?.branch ?? inferBranchFromCloneName(clonePath, dir.name, currentBranch);
      if (!metadata) {
        await ensureCloneMetadata(clonePath, branch);
      }
      clones.push({ name: dir.name, path: clonePath, branch, currentBranch });
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
    await ensureCloneMetadata(clonePath, branch);
    console.log(`Clone already exists at ${clonePath}`);
    return clonePath;
  }

  const clonesDir = await getClonesDir();
  await mkdir(clonesDir, { recursive: true });

  runGit(["clone", repoPath, clonePath], clonesDir);

  if (refExists(clonePath, `refs/heads/${branch}`)) {
    runGit(["checkout", branch], clonePath);
    await ensureCloneMetadata(clonePath, branch);
    return clonePath;
  }

  if (refExists(clonePath, `refs/remotes/origin/${branch}`)) {
    runGit(["checkout", "-b", branch, `origin/${branch}`, "--no-track"], clonePath);
    await ensureCloneMetadata(clonePath, branch);
    return clonePath;
  }

  try {
    runGit(["fetch", "origin", branch], clonePath);
    runGit(["checkout", "-b", branch, "FETCH_HEAD", "--no-track"], clonePath);
    await ensureCloneMetadata(clonePath, branch);
    return clonePath;
  } catch {
    // Branch doesn't exist
  }

  throw new Error(`Could not checkout branch '${branch}' in clone`);
}

export async function removeClone(cloneName: string): Promise<void> {
  const clonePath = join(await getClonesDir(), cloneName);
  if (await pathExists(clonePath)) {
    await rm(clonePath, { recursive: true, force: true });
  }
}

export function getCurrentBranch(repoPath: string): string {
  try {
    return runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoPath);
  } catch {
    return "main";
  }
}

export function isGitRepo(path: string): boolean {
  try {
    runGit(["rev-parse", "--git-dir"], path);
    return true;
  } catch {
    return false;
  }
}

export function createBranch(repoPath: string, branch: string, base: string): void {
  runGit(["branch", branch, base], repoPath);
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
