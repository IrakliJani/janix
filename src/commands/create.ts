import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { Command } from "commander";
import {
  containerName,
  findJanixRoot,
  getProjectName,
  getProjectRoot,
  sanitizeBranchForId,
  sanitizeBranchSafe,
} from "../lib/config.js";
import {
  getContainer,
  createContainer,
  attachToContainer,
  imageExists,
  buildImage,
  isContainerRunning,
  startContainer,
  getCacheInitCommands,
  assertDockerRunning,
  computeFlakeHash,
  getImageFlakeHash,
  getImageFlakeNix,
} from "../lib/docker.js";
import { branchExists, createBranch, createClone } from "../lib/git.js";
import { runInitScripts, getCurrentBranch } from "../lib/init.js";
import { selectBranch, confirm } from "../lib/interactive.js";
import { loadProjectConfig } from "../lib/project-config.js";
import { loadEnvFiles } from "../lib/env.js";

async function promptFlakeRebuild(project: string, projectRoot: string): Promise<boolean> {
  const currentHash = computeFlakeHash(projectRoot);
  const imageHash = getImageFlakeHash(project);
  if (!imageHash || imageHash === currentHash) return false;

  const oldContent = getImageFlakeNix(project);
  if (oldContent) {
    const oldTmp = join(tmpdir(), `janix-flake-old-${Date.now()}.nix`);
    try {
      writeFileSync(oldTmp, oldContent);
      console.log("\nflake.nix has changed since the image was built:\n");
      spawnSync(
        "git",
        ["diff", "--no-index", "--color=always", oldTmp, join(projectRoot, "flake.nix")],
        {
          stdio: "inherit",
        },
      );
    } finally {
      try {
        unlinkSync(oldTmp);
      } catch {
        /* ignore */
      }
    }
  } else {
    console.log("\nflake.nix has changed since the image was built.");
  }

  return confirm("Rebuild Docker image?");
}

export const createCommand = new Command("create")
  .alias("c")
  .description("Create a new dev environment for a branch")
  .argument("[branch]", "Branch name (interactive picker if not provided)")
  .option("--no-attach", "Don't attach to container after creation")
  .option("--rebuild", "Force rebuild the Docker image")
  .action(async (branchArg: string | undefined, options: { attach: boolean; rebuild: boolean }) => {
    // Verify we're in a janix project
    if (!findJanixRoot()) {
      console.error("Not in a janix project. Run 'janix init' first.");
      process.exit(1);
    }

    assertDockerRunning();

    const project = getProjectName();
    const projectRoot = getProjectRoot();

    // Get branch (interactive or from argument)
    const branch = branchArg ?? (await selectBranch());

    // Create branch if it doesn't exist
    if (!branchExists(projectRoot, branch)) {
      const base = getCurrentBranch(projectRoot);
      const ok = await confirm(`Branch '${branch}' doesn't exist. Create from '${base}'?`);
      if (!ok) process.exit(0);
      createBranch(projectRoot, branch, base);
    }

    const name = containerName(project, branch);

    // Check if container already exists for this branch
    const existing = getContainer(project, branch);
    if (existing) {
      console.log(`Container for ${project}/${branch} already exists`);
      if (options.attach) {
        if (!isContainerRunning(name)) {
          console.log("Starting stopped container...");
          startContainer(name);
        }
        attachToContainer(name);
      }
      return;
    }

    // Load project config
    const projectConfig = loadProjectConfig();

    // Built-in template vars available in override values
    const janixVars: Record<string, string> = {
      JANIX_BRANCH: branch,
      JANIX_PROJECT: project,
      JANIX_BRANCH_SLUG: sanitizeBranchForId(branch),
      JANIX_BRANCH_SAFE: sanitizeBranchSafe(branch),
    };

    const resolveTemplateVars = (value: string): string =>
      value.replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g, (_, name) => janixVars[name] ?? `$${name}`);

    // Load env files and apply stored overrides (with template var resolution)
    let env: Record<string, string> = {};
    if (projectConfig.envFiles.length > 0) {
      env = loadEnvFiles(projectConfig.envFiles, projectRoot);
    }
    if (Object.keys(projectConfig.envOverrides).length > 0) {
      const resolvedOverrides = Object.fromEntries(
        Object.entries(projectConfig.envOverrides).map(([k, v]) => [k, resolveTemplateVars(v)]),
      );
      env = { ...env, ...resolvedOverrides };
    }

    // Ensure Docker image exists for this project (or rebuild if requested)
    const needsBuild =
      !imageExists(project) || options.rebuild || (await promptFlakeRebuild(project, projectRoot));
    if (needsBuild) {
      console.log(`Building Docker image for ${project}...`);
      buildImage(project, projectRoot);
    }

    // Create clone
    console.log(`Creating clone for branch '${branch}'...`);
    const clonePath = createClone(branch);
    console.log(`Clone created at ${clonePath}`);

    // Create container
    console.log("Creating container...");
    const containerId = createContainer({
      project,
      branch,
      clonePath,
      network: projectConfig.network,
      caches: projectConfig.caches,
      env,
    });
    console.log(`Container created: ${containerId.slice(0, 12)}`);

    if (projectConfig.network) {
      console.log(`Joined network: ${projectConfig.network}`);
    }

    console.log(
      `Cache volume mounted: nix${projectConfig.caches.length > 0 ? `, ${projectConfig.caches.join(", ")}` : ""}`,
    );

    // Run cache init commands (create dirs, configure package managers)
    const cacheInitCommands = getCacheInitCommands(projectConfig.caches);
    if (cacheInitCommands.length > 0) {
      console.log("Configuring caches...");
      runInitScripts(cacheInitCommands, name);
    }

    // Run user init scripts
    if (projectConfig.init.length > 0) {
      console.log("Running init scripts...");
      runInitScripts(projectConfig.init, name, {
        JANIX_BRANCH: branch,
        JANIX_PROJECT: project,
        JANIX_BRANCH_SLUG: sanitizeBranchForId(branch),
        JANIX_BRANCH_SAFE: sanitizeBranchSafe(branch),
      });
    }

    // Attach if requested
    if (options.attach) {
      console.log("Attaching to container...");
      attachToContainer(name);
    } else {
      console.log(`\nTo attach: janix attach ${branch}`);
    }
  });
