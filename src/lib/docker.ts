import { execFileSync, spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { config, containerName, getProjectImageName, JANIX_ROOT } from "./config.js";

const FLAKE_HASH_LABEL = "janix.flake.hash";

export function computeFlakeHash(projectRoot: string): string {
  const hash = createHash("sha256");
  hash.update(readFileSync(join(projectRoot, "flake.nix")));
  const lockPath = join(projectRoot, "flake.lock");
  if (existsSync(lockPath)) hash.update(readFileSync(lockPath));
  return hash.digest("hex").slice(0, 16);
}

export function getImageFlakeHash(project: string): string | null {
  const imageName = getProjectImageName(project);
  try {
    const out = runDocker([
      "inspect",
      "--format",
      `{{index .Config.Labels "${FLAKE_HASH_LABEL}"}}`,
      imageName,
    ]);
    return out || null;
  } catch {
    return null;
  }
}

export function getImageFlakeNix(project: string): string | null {
  const imageName = getProjectImageName(project);
  // Create a stopped container, copy the file out, then remove it (faster than docker run)
  const create = spawnSync("docker", ["create", imageName], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (create.status !== 0) return null;
  const cid = create.stdout.trim();
  const tmpPath = join(tmpdir(), `janix-flake-${Date.now()}.nix`);
  try {
    const cp = spawnSync("docker", ["cp", `${cid}:/flake/flake.nix`, tmpPath], { stdio: "pipe" });
    if (cp.status !== 0) return null;
    return readFileSync(tmpPath, "utf-8");
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    spawnSync("docker", ["rm", cid], { stdio: "pipe" });
  }
}

export const CACHE_VOLUME = "janix-cache";
export const CACHE_MOUNT_PATH = "/cache";

/** Predefined cache configurations for package managers */
export const CACHE_CONFIGS = {
  pnpm: {
    env: {},
    init: ["mkdir -p /cache/pnpm/store", "pnpm config set store-dir /cache/pnpm/store"],
  },
  bun: {
    env: { BUN_INSTALL_CACHE_DIR: `${CACHE_MOUNT_PATH}/bun` },
    init: ["mkdir -p /cache/bun"],
  },
  npm: {
    env: { npm_config_cache: `${CACHE_MOUNT_PATH}/npm` },
    init: ["mkdir -p /cache/npm"],
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

export function assertDockerRunning(): void {
  const result = spawnSync("docker", ["info"], { stdio: "pipe" });
  if (result.status !== 0) {
    console.error("Docker is not running. Please start Docker and try again.");
    process.exit(1);
  }
}

export function buildImage(project: string, projectRoot: string): void {
  const imageName = getProjectImageName(project);

  // Create temp build context with all necessary files
  const buildContext = join(tmpdir(), `janix-build-${Date.now()}`);
  mkdirSync(buildContext, { recursive: true });

  try {
    // Copy files from janix repo
    copyFileSync(join(JANIX_ROOT, "Dockerfile.janix"), join(buildContext, "Dockerfile.janix"));
    copyFileSync(join(JANIX_ROOT, "nix.conf"), join(buildContext, "nix.conf"));

    // Copy project's flake files
    copyFileSync(join(projectRoot, "flake.nix"), join(buildContext, "flake.nix"));
    const flakeLock = join(projectRoot, "flake.lock");
    if (existsSync(flakeLock)) {
      copyFileSync(flakeLock, join(buildContext, "flake.lock"));
    }

    const flakeHash = computeFlakeHash(projectRoot);

    const result = spawnSync(
      "docker",
      [
        "build",
        "-t",
        imageName,
        "--label",
        `${FLAKE_HASH_LABEL}=${flakeHash}`,
        "-f",
        "Dockerfile.janix",
        ".",
      ],
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
  env?: Record<string, string>;
}

export function ensureVolumeExists(volumeName: string): void {
  try {
    runDocker(["volume", "inspect", volumeName]);
  } catch {
    runDocker(["volume", "create", volumeName]);
  }
}

export function createContainer(options: CreateContainerOptions): string {
  const { project, branch, clonePath, network, caches = [], env = {} } = options;
  const name = containerName(project, branch);

  // Always mount cache volume — nix uses it for download cache (XDG_CACHE_HOME)
  ensureVolumeExists(CACHE_VOLUME);

  const args = [
    "run",
    "-d",
    "--name",
    name,
    "-v",
    `${clonePath}:${config.containerWorkspace}`,
    "-v",
    `${config.claudeConfigDir}:${config.containerClaudeConfig}:ro`,
    "-v",
    `${CACHE_VOLUME}:${CACHE_MOUNT_PATH}`,
    "-e",
    `XDG_CACHE_HOME=${CACHE_MOUNT_PATH}`,
    "-w",
    config.containerWorkspace,
    "--add-host=host.docker.internal:host-gateway",
  ];

  // Add PM-specific env vars
  for (const cache of caches) {
    const cacheConfig = CACHE_CONFIGS[cache];
    for (const [key, value] of Object.entries(cacheConfig.env)) {
      args.push("-e", `${key}=${value}`);
    }
  }

  // Add env vars
  for (const [key, value] of Object.entries(env)) {
    args.push("-e", `${key}=${value}`);
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
      // Parse project and branch from container name: janix-<project>-<branch>
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

export function attachToContainer(name: string): void {
  const child = spawn(
    "docker",
    [
      "exec",
      "-it",
      "-w",
      config.containerWorkspace,
      name,
      "nix",
      "develop",
      "/flake",
      "--command",
      "zsh",
    ],
    { stdio: "inherit" },
  );

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
  const result = spawnSync("docker", ["inspect", "--format={{.State.Running}}", name], {
    encoding: "utf-8",
    stdio: "pipe",
  });
  return result.status === 0 && result.stdout.trim() === "true";
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
