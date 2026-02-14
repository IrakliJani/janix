import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Root of ikagent repo (up from src/lib/)
export const IKAGENT_ROOT = resolve(__dirname, "../..");

// Directory name for ikagent config
export const IKAGENT_DIR = ".ikagent";
export const CLONES_DIR = "clones";
export const CONFIG_FILE = "config.json";

export const config = {
  // Docker
  imageName: "ikagent",
  containerPrefix: "ikagent",

  // Host paths to mount
  claudeConfigDir: join(homedir(), ".config/claude"),

  // Container paths
  containerWorkspace: "/workspace",
  containerClaudeConfig: "/root/.config/claude",
} as const;

/**
 * Find .ikagent/ directory by walking up from cwd.
 * Returns the path to the .ikagent/ directory, or null if not found.
 */
export function findIkagentRoot(): string | null {
  let current = process.cwd();
  const root = resolve("/");

  while (current !== root) {
    const ikagentPath = join(current, IKAGENT_DIR);
    if (existsSync(ikagentPath)) {
      return ikagentPath;
    }
    current = dirname(current);
  }

  return null;
}

/**
 * Get the project root directory (parent of .ikagent/).
 * Throws if not in an ikagent project.
 */
export function getProjectRoot(): string {
  const ikagentRoot = findIkagentRoot();
  if (!ikagentRoot) {
    throw new Error("Not in an ikagent project. Run 'ikagent init' first.");
  }
  return dirname(ikagentRoot);
}

/**
 * Get the project name (directory name of project root).
 */
export function getProjectName(): string {
  return basename(getProjectRoot());
}

/**
 * Get the .ikagent/ directory path.
 * Throws if not in an ikagent project.
 */
export function getIkagentDir(): string {
  const ikagentRoot = findIkagentRoot();
  if (!ikagentRoot) {
    throw new Error("Not in an ikagent project. Run 'ikagent init' first.");
  }
  return ikagentRoot;
}

/**
 * Get the clones directory path (.ikagent/clones/).
 */
export function getClonesDir(): string {
  return join(getIkagentDir(), CLONES_DIR);
}

/**
 * Get the config file path (.ikagent/config.json).
 */
export function getConfigPath(): string {
  return join(getIkagentDir(), CONFIG_FILE);
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
 * Generate container name from project name and branch.
 */
export function containerName(project: string, branch: string): string {
  const sanitizedBranch = sanitizeBranchForContainer(branch);
  return `${config.containerPrefix}-${project}-${sanitizedBranch}`;
}
