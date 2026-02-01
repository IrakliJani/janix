import { execFileSync, spawn, spawnSync } from "node:child_process";
import { config, containerName, JAGENT_ROOT } from "./config.js";

export interface ContainerInfo {
  id: string;
  name: string;
  project: string;
  branch: string;
  status: string;
}

function runDocker(args: string[]): string {
  return execFileSync("docker", args, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

export function imageExists(): boolean {
  try {
    runDocker(["image", "inspect", config.imageName]);
    return true;
  } catch {
    return false;
  }
}

export function buildImage(dockerfilePath: string): void {
  const result = spawnSync(
    "docker",
    ["build", "-t", config.imageName, "-f", dockerfilePath, JAGENT_ROOT],
    {
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    throw new Error(`Docker build failed with exit code ${result.status}`);
  }
}

export function createContainer(project: string, branch: string, clonePath: string): string {
  const name = containerName(project, branch);

  const args = [
    "run",
    "-d",
    "--name",
    name,
    "-v",
    `${clonePath}:${config.containerWorkspace}`,
    "-v",
    `${config.claudeConfigDir}:${config.containerClaudeConfig}:ro`,
    "-w",
    config.containerWorkspace,
    "--add-host=host.docker.internal:host-gateway",
    config.imageName,
    "sleep",
    "infinity",
  ];

  return runDocker(args);
}

export function listContainers(): ContainerInfo[] {
  try {
    const output = runDocker([
      "ps",
      "-a",
      "--filter",
      `name=${config.containerPrefix}`,
      "--format",
      "{{.ID}}\t{{.Names}}\t{{.Status}}",
    ]);

    if (!output) return [];

    return output.split("\n").map((line) => {
      const [id, name, status] = line.split("\t");
      // Parse project and branch from container name: jaegent-<project>-<branch>
      const parts = name?.replace(`${config.containerPrefix}-`, "").split("-") ?? [];
      const project = parts[0] ?? "";
      const branch = parts.slice(1).join("-");

      return {
        id: id ?? "",
        name: name ?? "",
        project,
        branch,
        status: status ?? "",
      };
    });
  } catch {
    return [];
  }
}

export function getContainer(project: string, branch: string): ContainerInfo | undefined {
  const name = containerName(project, branch);
  const containers = listContainers();
  return containers.find((c) => c.name === name);
}

export function getContainerByName(nameOrId: string): ContainerInfo | undefined {
  const containers = listContainers();
  const term = nameOrId.toLowerCase();

  // Exact match on name or ID prefix
  const exact = containers.find((c) => c.name === nameOrId || c.id.startsWith(nameOrId));
  if (exact) return exact;

  // Match project/branch pattern (e.g., "foo/bar" or "foo-bar")
  const matches = containers.filter((c) => {
    const projectBranch = `${c.project}/${c.branch}`.toLowerCase();
    const projectBranchDash = `${c.project}-${c.branch}`.toLowerCase();
    return (
      projectBranch.includes(term) ||
      projectBranchDash.includes(term) ||
      c.name.toLowerCase().includes(term)
    );
  });

  // Return single match, undefined if ambiguous
  return matches.length === 1 ? matches[0] : undefined;
}

export function attachToContainer(name: string): void {
  const child = spawn("docker", ["exec", "-it", name, "zsh"], {
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

export function stopContainer(name: string): void {
  runDocker(["stop", name]);
}

export function startContainer(name: string): void {
  runDocker(["start", name]);
}

export function removeContainer(name: string): void {
  try {
    runDocker(["stop", name]);
  } catch {
    // Container might already be stopped
  }
  runDocker(["rm", name]);
}

export function isContainerRunning(name: string): boolean {
  const container = getContainerByName(name);
  return container?.status.toLowerCase().includes("up") ?? false;
}
