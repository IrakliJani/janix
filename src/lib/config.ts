import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Root of jagent repo (up from src/lib/)
export const JAGENT_ROOT = resolve(__dirname, "../..");

export const config = {
  // Directories
  projectsDir: join(JAGENT_ROOT, "projects"),
  clonesDir: join(JAGENT_ROOT, "clones"),

  // Docker
  imageName: "jaegent",
  containerPrefix: "jaegent",

  // Host paths to mount
  claudeConfigDir: join(homedir(), ".config/claude"),

  // Container paths
  containerWorkspace: "/workspace",
  containerClaudeConfig: "/root/.config/claude",
} as const;

export function getProjectRepo(project: string): string {
  return join(config.projectsDir, project);
}

export function getProjectClonesDir(project: string): string {
  return join(config.clonesDir, project);
}

export function getClonePath(project: string, branch: string): string {
  const sanitized = branch.replace(/\//g, "-");
  return join(getProjectClonesDir(project), sanitized);
}

export function containerName(project: string, branch: string): string {
  const sanitizedBranch = branch.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-");
  return `${config.containerPrefix}-${project}-${sanitizedBranch}`;
}
