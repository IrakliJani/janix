import { spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { resolveIntegrations, type Integration } from "../integrations/index.js";
import { config, containerName, getProjectImageName } from "./config.js";
import { pathExists } from "./fs.js";
import {
  generateIntegrationsNix,
  getDockerfileTemplate,
  getHomeNix,
  getNixConfigs,
} from "./nix.js";

const FLAKE_HASH_LABEL = "janix.flake.hash";
const DOCKERFILE_HASH_LABEL = "janix.dockerfile.hash";
const HOME_NIX_HASH_LABEL = "janix.home-nix.hash";
const INTEGRATIONS_NIX_HASH_LABEL = "janix.integrations-nix.hash";
const INTEGRATION_LABEL = "janix.integrations";
const PROJECT_LABEL = "janix.project";
const BRANCH_LABEL = "janix.branch";

const CACHE_VOLUME = "janix-cache";
const CACHE_PATH = "/root/.cache";

interface RunCommandOptions {
  cwd?: string;
  stdio?: "pipe" | "inherit";
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

// When stdio is "inherit", stdout/stderr are null and the resolved value is always "".
function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdio = options.stdio ?? "pipe";
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(new Error(`Failed to start ${formatCommand(command, args)}: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      const details = stderr.trim() || stdout.trim();
      reject(
        new Error(
          details || `${formatCommand(command, args)} failed with exit code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}

async function runDocker(args: string[]): Promise<string> {
  const result = await runCommand("docker", args);
  return result.trim();
}

async function getImageLabel(project: string, label: string): Promise<string | null> {
  const imageName = getProjectImageName(project);
  try {
    const out = await runDocker([
      "inspect",
      "--format",
      `{{index .Config.Labels "${label}"}}`,
      imageName,
    ]);
    return out || null;
  } catch {
    return null;
  }
}

export async function computeFlakeHash(projectRoot: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update(await readFile(join(projectRoot, "flake.nix")));
  const lockPath = join(projectRoot, "flake.lock");
  if (await pathExists(lockPath)) {
    hash.update(await readFile(lockPath));
  }
  return hash.digest("hex").slice(0, 16);
}

export async function getImageFlakeHash(project: string): Promise<string | null> {
  return getImageLabel(project, FLAKE_HASH_LABEL);
}

export async function getImageFlakeNix(project: string): Promise<string | null> {
  const imageName = getProjectImageName(project);
  try {
    const result = await runCommand("docker", [
      "run",
      "--rm",
      "--entrypoint",
      "cat",
      imageName,
      "/flake/flake.nix",
    ]);
    return result.trim() || null;
  } catch {
    return null;
  }
}

export async function getImageIntegrations(project: string): Promise<string | null> {
  return getImageLabel(project, INTEGRATION_LABEL);
}

export async function generateDockerfile(integrations: Integration[]): Promise<string> {
  const template = await getDockerfileTemplate();
  const lines = integrations.flatMap((i) => i.dockerfileLines).join("\n");
  return template.replace("{{INTEGRATION_LINES}}", lines || "");
}

export async function computeDockerfileHash(integrations: Integration[]): Promise<string> {
  const dockerfile = await generateDockerfile(integrations);
  return hashContent(dockerfile);
}

export async function getImageDockerfileHash(project: string): Promise<string | null> {
  return getImageLabel(project, DOCKERFILE_HASH_LABEL);
}

export async function dockerfileChanged(project: string, integrations: string[]): Promise<boolean> {
  const imageHash = await getImageDockerfileHash(project);
  if (!imageHash) return true;
  const resolved = resolveIntegrations(integrations);
  const currentHash = await computeDockerfileHash(resolved);
  return imageHash !== currentHash;
}

export async function homeNixChanged(project: string): Promise<boolean> {
  const imageHash = await getImageLabel(project, HOME_NIX_HASH_LABEL);
  if (!imageHash) return true;
  const currentHash = hashContent(await getHomeNix());
  return imageHash !== currentHash;
}

export async function integrationsNixChanged(
  project: string,
  integrations: string[],
): Promise<boolean> {
  const imageHash = await getImageLabel(project, INTEGRATIONS_NIX_HASH_LABEL);
  if (!imageHash) return true;
  const resolved = resolveIntegrations(integrations);
  const integrationsNix = generateIntegrationsNix(integrations, getNixConfigs(resolved));
  const currentHash = hashContent(integrationsNix);
  return imageHash !== currentHash;
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

export async function copyCredentialToContainer(
  container: string,
  content: string,
  containerPath: string,
): Promise<void> {
  const parentDir = dirname(containerPath);
  await runCommand("docker", ["exec", container, "mkdir", "-p", parentDir]);

  const tempDir = await mkdtemp(join(tmpdir(), "janix-cred-"));
  const tempPath = join(tempDir, "credential");

  try {
    await writeFile(tempPath, content, { mode: 0o600 });
    await runCommand("docker", ["cp", tempPath, `${container}:${containerPath}`]);
  } catch (error) {
    throw new Error(`Failed to copy credential to ${containerPath}`, { cause: error });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export interface ContainerInfo {
  id: string;
  name: string;
  project: string;
  branch: string;
  state: string;
  status: string;
}

export async function imageExists(project: string): Promise<boolean> {
  const imageName = getProjectImageName(project);
  try {
    await runDocker(["image", "inspect", imageName]);
    return true;
  } catch {
    return false;
  }
}

export async function assertDockerRunning(): Promise<void> {
  try {
    await runCommand("docker", ["info"]);
  } catch {
    console.error("Docker is not running. Please start Docker and try again.");
    process.exit(1);
  }
}

export async function buildImage(
  project: string,
  projectRoot: string,
  integrations: string[],
): Promise<void> {
  const imageName = getProjectImageName(project);
  const resolved = resolveIntegrations(integrations);
  const dockerfile = await generateDockerfile(resolved);
  const homeNix = await getHomeNix();
  const integrationsNix = generateIntegrationsNix(integrations, getNixConfigs(resolved));
  const buildContext = await mkdtemp(join(tmpdir(), "janix-build-"));

  try {
    await writeFile(join(buildContext, "Dockerfile"), dockerfile);
    await writeFile(join(buildContext, "home.nix"), homeNix);
    await writeFile(join(buildContext, "integrations.nix"), integrationsNix);

    await copyFile(join(projectRoot, "flake.nix"), join(buildContext, "flake.nix"));
    const flakeLock = join(projectRoot, "flake.lock");
    if (await pathExists(flakeLock)) {
      await copyFile(flakeLock, join(buildContext, "flake.lock"));
    }

    const flakeHash = await computeFlakeHash(projectRoot);
    const dockerfileHash = await computeDockerfileHash(resolved);
    const homeNixHash = hashContent(homeNix);
    const integrationsNixHash = hashContent(integrationsNix);

    await runCommand(
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
        `${HOME_NIX_HASH_LABEL}=${homeNixHash}`,
        "--label",
        `${INTEGRATIONS_NIX_HASH_LABEL}=${integrationsNixHash}`,
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
  } finally {
    await rm(buildContext, { recursive: true, force: true });
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

async function ensureVolumeExists(volumeName: string): Promise<void> {
  try {
    await runDocker(["volume", "inspect", volumeName]);
  } catch {
    await runDocker(["volume", "create", volumeName]);
  }
}

export async function createContainer(options: CreateContainerOptions): Promise<string> {
  const { project, branch, clonePath, projectRoot, network, integrations = [], env = {} } = options;
  const name = containerName(project, branch);

  await ensureVolumeExists(CACHE_VOLUME);

  const args = [
    "run",
    "-d",
    "--name",
    name,
    "--label",
    `${PROJECT_LABEL}=${project}`,
    "--label",
    `${BRANCH_LABEL}=${branch}`,
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

  const integrationVolumes = getIntegrationVolumes(integrations);
  for (const vol of integrationVolumes) {
    await ensureVolumeExists(vol.name);
    args.push("-v", `${vol.name}:${vol.path}`);
  }

  const integrationEnv = getIntegrationEnv(integrations);
  for (const [key, value] of Object.entries(integrationEnv)) {
    args.push("-e", `${key}=${value}`);
  }

  for (const [key, value] of Object.entries(env)) {
    args.push("-e", `${key}=${value}`);
  }

  if (network) {
    args.push("--network", network);
  }

  const imageName = getProjectImageName(project);
  args.push(imageName, "sleep", "infinity");

  return runDocker(args);
}

export async function listContainers(): Promise<ContainerInfo[]> {
  try {
    const output = await runDocker([
      "ps",
      "-a",
      "--filter",
      `name=${config.containerPrefix}`,
      "--format",
      `{{.ID}}\t{{.Names}}\t{{.State}}\t{{.Status}}\t{{.Label "${PROJECT_LABEL}"}}\t{{.Label "${BRANCH_LABEL}"}}`,
    ]);

    if (!output) return [];

    return output
      .split("\n")
      .map((line) => {
        const [id, name, state, status, labeledProject, labeledBranch] = line.split("\t");
        const parsed = name?.replace(`${config.containerPrefix}-`, "") ?? "";
        const parts = parsed.split("-");
        const project = labeledProject || parts[0] || "";
        const branch = labeledBranch || parts.slice(1).join("-");

        return {
          id: id ?? "",
          name: name ?? "",
          project,
          branch,
          state: state ?? "",
          status: status ?? "",
        };
      })
      .sort((a, b) => a.project.localeCompare(b.project) || a.branch.localeCompare(b.branch));
  } catch {
    return [];
  }
}

export async function getContainer(
  project: string,
  branch: string,
): Promise<ContainerInfo | undefined> {
  const name = containerName(project, branch);
  const containers = await listContainers();
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

export async function stopContainer(name: string): Promise<void> {
  await runDocker(["stop", name]);
}

export async function startContainer(name: string): Promise<void> {
  await runDocker(["start", name]);
}

export async function removeContainer(name: string): Promise<void> {
  try {
    await runDocker(["stop", name]);
  } catch {
    // Container might already be stopped
  }
  await runDocker(["rm", name]);
}

export async function isContainerRunning(name: string): Promise<boolean> {
  try {
    const result = await runDocker(["inspect", "--format={{.State.Running}}", name]);
    return result === "true";
  } catch {
    return false;
  }
}

export async function listNetworks(): Promise<string[]> {
  try {
    const output = await runDocker(["network", "ls", "--format", "{{.Name}}"]);
    return output.split("\n").filter((n) => n);
  } catch {
    return [];
  }
}
