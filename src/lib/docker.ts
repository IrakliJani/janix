import { execFileSync, spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { config, containerName, getProjectImageName, IKAGENT_ROOT } from "./config.js";

export const CACHE_VOLUME = "ikagent-cache";
export const CACHE_MOUNT_PATH = "/cache";

/** Predefined cache configurations for package managers */
export const CACHE_CONFIGS = {
  pnpm: {
    env: { PNPM_HOME: `${CACHE_MOUNT_PATH}/pnpm` },
    init: ["mkdir -p /cache/pnpm"],
  },
  bun: {
    env: { BUN_INSTALL: `${CACHE_MOUNT_PATH}/bun` },
    init: ["mkdir -p /cache/bun"],
  },
  npm: {
    env: {},
    init: ["mkdir -p /cache/npm", "npm config set cache /cache/npm"],
  },
  yarn: {
    env: { YARN_CACHE_FOLDER: `${CACHE_MOUNT_PATH}/yarn` },
    init: ["mkdir -p /cache/yarn"],
  },
} as const;

export type CacheType = keyof typeof CACHE_CONFIGS;

/** Get init commands for selected caches */
export function getCacheInitCommands(caches: CacheType[]): string[] {
  const commands: string[] = [];
  for (const cache of caches) {
    commands.push(...CACHE_CONFIGS[cache].init);
  }
  return commands;
}

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

export function imageExists(project: string): boolean {
  const imageName = getProjectImageName(project);
  try {
    runDocker(["image", "inspect", imageName]);
    return true;
  } catch {
    return false;
  }
}

export function buildImage(project: string, ikagentDir: string): void {
  const imageName = getProjectImageName(project);

  // Create temp build context with all necessary files
  const buildContext = join(tmpdir(), `ikagent-build-${Date.now()}`);
  mkdirSync(buildContext, { recursive: true });

  try {
    // Copy files from ikagent repo
    copyFileSync(
      join(IKAGENT_ROOT, "Dockerfile.ikagent"),
      join(buildContext, "Dockerfile.ikagent"),
    );
    copyFileSync(join(IKAGENT_ROOT, "nix.conf"), join(buildContext, "nix.conf"));

    // Copy project-specific packages.nix
    copyFileSync(join(ikagentDir, "packages.nix"), join(buildContext, "packages.nix"));

    const result = spawnSync(
      "docker",
      ["build", "-t", imageName, "-f", "Dockerfile.ikagent", "."],
      {
        cwd: buildContext,
        stdio: "inherit",
      },
    );

    if (result.status !== 0) {
      throw new Error(`Docker build failed with exit code ${result.status}`);
    }
  } finally {
    // Clean up temp directory
    rmSync(buildContext, { recursive: true, force: true });
  }
}

export interface CreateContainerOptions {
  project: string;
  branch: string;
  clonePath: string;
  network?: string | null;
  caches?: CacheType[];
}

export function ensureVolumeExists(volumeName: string): void {
  try {
    runDocker(["volume", "inspect", volumeName]);
  } catch {
    runDocker(["volume", "create", volumeName]);
  }
}

export function createContainer(options: CreateContainerOptions): string {
  const { project, branch, clonePath, network, caches = [] } = options;
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
  ];

  // Add cache volume if caches are specified
  if (caches.length > 0) {
    ensureVolumeExists(CACHE_VOLUME);
    args.push("-v", `${CACHE_VOLUME}:${CACHE_MOUNT_PATH}`);

    // Add environment variables for each cache
    for (const cache of caches) {
      const cacheConfig = CACHE_CONFIGS[cache];
      for (const [key, value] of Object.entries(cacheConfig.env)) {
        args.push("-e", `${key}=${value}`);
      }
    }
  }

  // Add network if specified
  if (network) {
    args.push("--network", network);
  }

  const imageName = getProjectImageName(project);
  args.push(imageName, "sleep", "infinity");

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
      // Parse project and branch from container name: ikagent-<project>-<branch>
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

/**
 * List available Docker networks.
 */
export function listNetworks(): string[] {
  try {
    const output = runDocker(["network", "ls", "--format", "{{.Name}}"]);
    return output.split("\n").filter((n) => n);
  } catch {
    return [];
  }
}
