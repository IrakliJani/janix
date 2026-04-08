import { config, getProjectName, sanitizeBranchForContainer } from "./config.js";
import { listContainers, type ContainerInfo } from "./docker.js";
import { listClones } from "./git.js";

export function formatState(container: ContainerInfo | undefined): string {
  if (!container) return "\x1b[31mno container\x1b[0m";

  switch (container.state.toLowerCase()) {
    case "running":
      return "\x1b[32mrunning\x1b[0m";
    case "created":
    case "paused":
    case "restarting":
    case "exited":
      return `\x1b[33m${container.state}\x1b[0m`;
    default:
      return `\x1b[31m${container.state || "unknown"}\x1b[0m`;
  }
}

export function containerBranchKey(projectPrefix: string, container: ContainerInfo): string {
  if (container.branch) return container.branch;
  if (container.name.startsWith(projectPrefix)) {
    return container.name.slice(projectPrefix.length);
  }
  return "";
}

export async function getEnvironments() {
  const project = await getProjectName();
  const clones = (await listClones()).sort((a, b) => a.branch.localeCompare(b.branch));
  const projectPrefix = `${config.containerPrefix}-${project}-`;
  const containers = (await listContainers()).filter(
    (c) => c.project === project || c.name.startsWith(projectPrefix),
  );

  const containerMap = new Map<string, ContainerInfo>();
  for (const container of containers) {
    const branchKey = containerBranchKey(projectPrefix, container);
    const keys = [branchKey, sanitizeBranchForContainer(branchKey)];
    for (const key of keys) {
      if (key) {
        containerMap.set(key, container);
      }
    }
  }

  return { project, clones, containers, containerMap, projectPrefix };
}
