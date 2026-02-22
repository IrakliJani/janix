import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import slugify from "@sindresorhus/slugify";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Root of janix package (up from dist/lib/)
export const JANIX_ROOT = resolve(__dirname, "../..");
export const JANIX_SUPPORT = join(JANIX_ROOT, "support");

// Directory name for janix config
export const JANIX_DIR = ".janix";
export const CLONES_DIR = "clones";
export const CONFIG_FILE = "config.json";

export const config = {
  // Docker
  containerPrefix: "janix",

  // Host paths to mount
  claudeConfigDir: join(homedir(), ".config/claude"),

  // Container paths
  containerWorkspace: "/workspace",
  containerClaudeConfig: "/root/.config/claude",
} as const;

/**
 * Get the Docker image name for a project.
 */
export function getProjectImageName(project: string): string {
  return `janix/${project}`;
}

/**
 * Find .janix/ directory by walking up from cwd.
 * Returns the path to the .janix/ directory, or null if not found.
 */
export function findJanixRoot(): string | null {
  let current = process.cwd();
  const root = resolve("/");

  while (current !== root) {
    const janixPath = join(current, JANIX_DIR);
    if (existsSync(janixPath)) {
      return janixPath;
    }
    current = dirname(current);
  }

  return null;
}

/**
 * Get the project root directory (parent of .janix/).
 * Throws if not in a janix project.
 */
export function getProjectRoot(): string {
  const janixRoot = findJanixRoot();
  if (!janixRoot) {
    throw new Error("Not in a janix project. Run 'janix init' first.");
  }
  return dirname(janixRoot);
}

/**
 * Get the project name (directory name of project root).
 */
export function getProjectName(): string {
  return basename(getProjectRoot());
}

/**
 * Get the .janix/ directory path.
 * Throws if not in a janix project.
 */
export function getJanixDir(): string {
  const janixRoot = findJanixRoot();
  if (!janixRoot) {
    throw new Error("Not in a janix project. Run 'janix init' first.");
  }
  return janixRoot;
}

/**
 * Get the clones directory path (.janix/clones/).
 */
export function getClonesDir(): string {
  return join(getJanixDir(), CLONES_DIR);
}

/**
 * Get the config file path (.janix/config.json).
 */
export function getConfigPath(): string {
  return join(getJanixDir(), CONFIG_FILE);
}

/**
 * Get the path for a specific clone.
 */
export function getClonePath(branch: string): string {
  const sanitized = branch.replace(/\//g, "-");
  return join(getClonesDir(), sanitized);
}

/**
 * Sanitize branch name for Docker container naming.
 */
export function sanitizeBranchForContainer(branch: string): string {
  return branch.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-");
}

/**
 * Sanitize branch name for use in file names, database names, etc.
 * Replaces all non-alphanumeric characters with underscores, lowercased.
 */
export function sanitizeBranchForId(branch: string): string {
  return slugify(branch, { separator: "-" });
}

export function sanitizeBranchSafe(branch: string): string {
  return slugify(branch, { separator: "_" });
}

/**
 * Generate container name from project name and branch.
 */
export function containerName(project: string, branch: string): string {
  const sanitizedBranch = sanitizeBranchForContainer(branch);
  return `${config.containerPrefix}-${project}-${sanitizedBranch}`;
}
