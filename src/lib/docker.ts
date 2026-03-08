import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { config, containerName, getProjectImageName } from "./config.js";
import { resolveIntegrations, type Integration } from "../integrations/index.js";
import { HOME_NIX, DOCKERFILE_TEMPLATE, generateIntegrationsNix, getNixConfigs } from "./nix.js";

const FLAKE_HASH_LABEL = "janix.flake.hash";
const DOCKERFILE_HASH_LABEL = "janix.dockerfile.hash";
const INTEGRATION_LABEL = "janix.integrations";

const CACHE_VOLUME = "janix-cache";
const CACHE_PATH = "/root/.cache";

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

// TODO: this is not optimal, I would expect it to actually use the prebuilt image to diff with the existing one...
export function getImageFlakeNix(project: string): string | null {
  const imageName = getProjectImageName(project);
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

export function getImageIntegrations(project: string): string | null {
  const imageName = getProjectImageName(project);
  try {
    const out = runDocker([
      "inspect",
      "--format",
      `{{index .Config.Labels "${INTEGRATION_LABEL}"}}`,
      imageName,
    ]);
    return out || null;
  } catch {
    return null;
  }
}

export function computeDockerfileHash(integrations: Integration[]): string {
  const dockerfile = generateDockerfile(integrations);
  return createHash("sha256").update(dockerfile).digest("hex").slice(0, 16);
}

export function getImageDockerfileHash(project: string): string | null {
  const imageName = getProjectImageName(project);
  try {
    const out = runDocker([
      "inspect",
      "--format",
      `{{index .Config.Labels "${DOCKERFILE_HASH_LABEL}"}}`,
      imageName,
    ]);
    return out || null;
  } catch {
    return null;
  }
}

export function dockerfileChanged(project: string, integrations: string[]): boolean {
  const imageHash = getImageDockerfileHash(project);
  if (!imageHash) return true;
  const resolved = resolveIntegrations(integrations);
  const currentHash = computeDockerfileHash(resolved);
  return imageHash !== currentHash;
}

export function generateDockerfile(integrations: Integration[]): string {
  const lines = integrations.flatMap((i) => i.dockerfileLines).join("\n");
  return DOCKERFILE_TEMPLATE.replace("{{INTEGRATION_LINES}}", lines || "");
}

export function getIntegrationInitCommands(ids: string[]): string[] {
  return resolveIntegrations(ids).flatMap((i) => i.initCommands);
}

export function getIntegrationVolumes(ids: string[]): { name: string; path: string }[] {
  return resolveIntegrations(ids).flatMap((i) => i.volumes);
}

export function getIntegrationEnv(ids: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const integration of resolveIntegrations(ids)) {
    Object.assign(env, integration.env);
  }
  return env;
}

export function copyCredentialToContainer(
  container: string,
  content: string,
  containerPath: string,
): void {
  const parentDir = dirname(containerPath);
  spawnSync("docker", ["exec", container, "mkdir", "-p", parentDir], { stdio: "pipe" });

  const tmpPath = join(tmpdir(), `janix-cred-${Date.now()}`);
  writeFileSync(tmpPath, content, { mode: 0o600 });
  try {
    const result = spawnSync("docker", ["cp", tmpPath, `${container}:${containerPath}`], {
      stdio: "pipe",
    });
    if (result.status !== 0) {
      throw new Error(`Failed to copy credential to ${containerPath}`);
    }
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
  }
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

export function buildImage(project: string, projectRoot: string, integrations: string[]): void {
  const imageName = getProjectImageName(project);
  const resolved = resolveIntegrations(integrations);
  const dockerfile = generateDockerfile(resolved);

  // TODO: how does files in temp dir last?
  // TODO: second question, can we use those files to actually diff dockerfile and home.nix if they changed at all? we can do so by adding timestamp or unique hash label to a docker images we build?
  const buildContext = join(tmpdir(), `janix-build-${Date.now()}`);
  // TODO: I see that you are using a lot of sync functions. cant we use async counterparts? same goes with everything else, like writing files etc...
  mkdirSync(buildContext, { recursive: true });

  try {
    // Write generated Dockerfile, home.nix, and integrations.nix
    writeFileSync(join(buildContext, "Dockerfile"), dockerfile);
    writeFileSync(join(buildContext, "home.nix"), HOME_NIX);
    const nixConfigs = getNixConfigs(resolved);
    writeFileSync(
      join(buildContext, "integrations.nix"),
      generateIntegrationsNix(integrations, nixConfigs),
    );

    // Copy project's flake files
    copyFileSync(join(projectRoot, "flake.nix"), join(buildContext, "flake.nix"));
    const flakeLock = join(projectRoot, "flake.lock");
    if (existsSync(flakeLock)) {
      copyFileSync(flakeLock, join(buildContext, "flake.lock"));
    }

    const flakeHash = computeFlakeHash(projectRoot);
    const dockerfileHash = computeDockerfileHash(resolved);

    const result = spawnSync(
      "docker",
      [
        "build",
        "-t",
        imageName,
        "--label",
        `${FLAKE_HASH_LABEL}=${flakeHash}`,
        "--label",
        `${DOCKERFILE_HASH_LABEL}=${dockerfileHash}`,
        "--label",
        `${INTEGRATION_LABEL}=${integrations.join(",")}`,
        "-f",
        "Dockerfile",
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
    rmSync(buildContext, { recursive: true, force: true });
  }
}

export interface CreateContainerOptions {
  project: string;
  branch: string;
  clonePath: string;
  projectRoot: string;
  network?: string | null;
  integrations?: string[];
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
  const { project, branch, clonePath, projectRoot, network, integrations = [], env = {} } = options;
  const name = containerName(project, branch);

  // Always mount the shared cache volume
  ensureVolumeExists(CACHE_VOLUME);

  const args = [
    "run",
    "-d",
    "--name",
    name,
    "-v",
    `${clonePath}:${config.containerWorkspace}`,
    "-v",
    `${projectRoot}/.git:${projectRoot}/.git`,
    "-v",
    `${CACHE_VOLUME}:${CACHE_PATH}`,
    "-e",
    `XDG_CACHE_HOME=${CACHE_PATH}`,
    "-w",
    config.containerWorkspace,
    "--add-host=host.docker.internal:host-gateway",
  ];

  // Mount integration volumes
  const integrationVolumes = getIntegrationVolumes(integrations);
  for (const vol of integrationVolumes) {
    ensureVolumeExists(vol.name);
    args.push("-v", `${vol.name}:${vol.path}`);
  }

  // Add integration env vars
  const integrationEnv = getIntegrationEnv(integrations);
  for (const [key, value] of Object.entries(integrationEnv)) {
    args.push("-e", `${key}=${value}`);
  }

  // Add user env vars
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

// TODO: this list is ugly, basic and lame, maybe also offer to attach to the container? but also show all the statuses that you show RN.
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

export function listNetworks(): string[] {
  try {
    const output = runDocker(["network", "ls", "--format", "{{.Name}}"]);
    return output.split("\n").filter((n) => n);
  } catch {
    return [];
  }
}
