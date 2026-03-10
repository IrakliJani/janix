import { basename, dirname, join, resolve } from "node:path";
import slugify from "@sindresorhus/slugify";
import { pathExists } from "./fs.js";

export const JANIX_DIR = ".janix";
export const CLONES_DIR = "clones";
export const CONFIG_FILE = "config.json";

export const config = {
  containerPrefix: "janix",
  containerWorkspace: "/workspace",
} as const;

export function getProjectImageName(project: string): string {
  return `janix/${project}`;
}

let _janixRoot: string | null | undefined;

export async function findJanixRoot(): Promise<string | null> {
  if (_janixRoot !== undefined) return _janixRoot;

  let current = process.cwd();
  const root = resolve("/");

  while (current !== root) {
    const janixPath = join(current, JANIX_DIR);
    if (await pathExists(janixPath)) {
      _janixRoot = janixPath;
      return janixPath;
    }
    current = dirname(current);
  }

  _janixRoot = null;
  return null;
}

export async function getProjectRoot(): Promise<string> {
  const janixRoot = await findJanixRoot();
  if (!janixRoot) {
    throw new Error("Not in a janix project. Run 'janix init' first.");
  }
  return dirname(janixRoot);
}

export async function getProjectName(): Promise<string> {
  return basename(await getProjectRoot());
}

export async function getJanixDir(): Promise<string> {
  const janixRoot = await findJanixRoot();
  if (!janixRoot) {
    throw new Error("Not in a janix project. Run 'janix init' first.");
  }
  return janixRoot;
}

export async function getClonesDir(): Promise<string> {
  return join(await getJanixDir(), CLONES_DIR);
}

export async function getConfigPath(): Promise<string> {
  return join(await getJanixDir(), CONFIG_FILE);
}

export async function getClonePath(branch: string): Promise<string> {
  const sanitized = branch.replace(/\//g, "-");
  return join(await getClonesDir(), sanitized);
}

export function sanitizeBranchForContainer(branch: string): string {
  return branch.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-");
}

export function sanitizeBranchForId(branch: string): string {
  return slugify(branch, { separator: "-" });
}

export function sanitizeBranchSafe(branch: string): string {
  return slugify(branch, { separator: "_" });
}

export function containerName(project: string, branch: string): string {
  const sanitizedBranch = sanitizeBranchForContainer(branch);
  return `${config.containerPrefix}-${project}-${sanitizedBranch}`;
}
