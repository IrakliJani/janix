import { Command } from "commander";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  containerName,
  findIkagentRoot,
  getProjectName,
  getProjectRoot,
  IKAGENT_ROOT,
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
} from "../lib/docker.js";
import { branchExists, createClone } from "../lib/git.js";
import { copyFilesToClone, runInitScripts } from "../lib/init.js";
import { selectBranch } from "../lib/interactive.js";
import { loadProjectConfig } from "../lib/project-config.js";

export const createCommand = new Command("create")
  .alias("c")
  .description("Create a new dev environment for a branch")
  .argument("[branch]", "Branch name (interactive picker if not provided)")
  .option("--no-attach", "Don't attach to container after creation")
  .action(async (branchArg: string | undefined, options: { attach: boolean }) => {
    // Verify we're in an ikagent project
    if (!findIkagentRoot()) {
      console.error("Not in an ikagent project. Run 'ikagent init' first.");
      process.exit(1);
    }

    const project = getProjectName();
    const projectRoot = getProjectRoot();

    // Get branch (interactive or from argument)
    const branch = branchArg ?? (await selectBranch());

    // Check if branch exists
    if (!branchExists(projectRoot, branch)) {
      console.error(`Branch '${branch}' does not exist locally or remotely`);
      process.exit(1);
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

    // Ensure Docker image exists
    const dockerfilePath = join(IKAGENT_ROOT, "Dockerfile.ikagent");
    if (!imageExists()) {
      if (!existsSync(dockerfilePath)) {
        console.error(`Dockerfile not found at ${dockerfilePath}`);
        process.exit(1);
      }
      console.log("Building Docker image...");
      buildImage(dockerfilePath);
    }

    // Load project config
    const projectConfig = loadProjectConfig();

    // Create clone
    console.log(`Creating clone for branch '${branch}'...`);
    const clonePath = createClone(branch);
    console.log(`Clone created at ${clonePath}`);

    // Copy files from project root to clone
    if (projectConfig.copy.length > 0) {
      console.log("Copying files...");
      copyFilesToClone(projectConfig.copy, clonePath);
    }

    // Create container
    console.log("Creating container...");
    const containerId = createContainer({
      project,
      branch,
      clonePath,
      network: projectConfig.network,
      caches: projectConfig.caches,
    });
    console.log(`Container created: ${containerId.slice(0, 12)}`);

    if (projectConfig.network) {
      console.log(`Joined network: ${projectConfig.network}`);
    }

    if (projectConfig.caches.length > 0) {
      console.log(`Cache volume mounted: ${projectConfig.caches.join(", ")}`);
    }

    // Run cache init commands (create dirs, configure package managers)
    const cacheInitCommands = getCacheInitCommands(projectConfig.caches);
    if (cacheInitCommands.length > 0) {
      console.log("Configuring caches...");
      runInitScripts(cacheInitCommands, name);
    }

    // Run user init scripts
    if (projectConfig.init.length > 0) {
      console.log("Running init scripts...");
      runInitScripts(projectConfig.init, name);
    }

    // Attach if requested
    if (options.attach) {
      console.log("Attaching to container...");
      attachToContainer(name);
    } else {
      console.log(`\nTo attach: ikagent attach ${branch}`);
    }
  });
