import { basename, dirname, join, resolve } from "node:path";
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

function isLowerAlphaNumByte(byte: number): boolean {
  return (byte >= 0x61 && byte <= 0x7a) || (byte >= 0x30 && byte <= 0x39);
}

export function encodeBranchForResource(branch: string): string {
  if (branch.length === 0) {
    throw new Error("Branch name cannot be empty");
  }

  return Array.from(Buffer.from(branch, "utf8"), (byte) => {
    if (isLowerAlphaNumByte(byte)) {
      return String.fromCharCode(byte);
    }

    if (byte === 0x2d) {
      return "--";
    }

    return `-${byte.toString(16).padStart(2, "0")}`;
  }).join("");
}

function isHexPair(value: string): boolean {
  return /^[0-9a-f]{2}$/.test(value);
}

export function decodeBranchFromResource(key: string): string {
  if (key.length === 0) {
    throw new Error("Invalid resource branch key: ");
  }

  const bytes: number[] = [];

  for (let i = 0; i < key.length; ) {
    const ch = key.charAt(i);
    if (ch !== "-") {
      bytes.push(ch.charCodeAt(0));
      i += 1;
      continue;
    }

    const next = key[i + 1];
    if (next === "-") {
      bytes.push(0x2d);
      i += 2;
      continue;
    }

    const hex = key.slice(i + 1, i + 3);
    if (!isHexPair(hex)) {
      throw new Error(`Invalid resource branch key: ${key}`);
    }

    bytes.push(Number.parseInt(hex, 16));
    i += 3;
  }

  const branch = Buffer.from(bytes).toString("utf8");
  if (encodeBranchForResource(branch) !== key) {
    throw new Error(`Invalid resource branch key: ${key}`);
  }

  return branch;
}

export async function getClonePath(branch: string): Promise<string> {
  return join(await getClonesDir(), encodeBranchForResource(branch));
}

export function sanitizeBranchForContainer(branch: string): string {
  return branch.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-");
}

export function containerName(project: string, branch: string): string {
  return `${config.containerPrefix}-${project}-${encodeBranchForResource(branch)}`;
}
