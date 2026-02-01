import { Command } from "commander";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { containerName, getProjectRepo, JAGENT_ROOT } from "../lib/config.js";
import {
  getContainer,
  createContainer,
  attachToContainer,
  imageExists,
  buildImage,
  isContainerRunning,
  startContainer,
} from "../lib/docker.js";
import { branchExists, createClone } from "../lib/git.js";
import { selectProject, selectBranch } from "../lib/interactive.js";

export const createCommand = new Command("create")
  .alias("c")
  .description("Create a new dev environment for a branch")
  .argument("[project]", "Project name (interactive picker if not provided)")
  .argument("[branch]", "Branch name (interactive picker if not provided)")
  .option("--no-attach", "Don't attach to container after creation")
  .action(
    async (
      projectArg: string | undefined,
      branchArg: string | undefined,
      options: { attach: boolean },
    ) => {
      // Get project
      const project = projectArg ?? (await selectProject());
      const repoPath = getProjectRepo(project);

      // Verify project repo exists
      if (!existsSync(repoPath)) {
        console.error(`Project repo not found at ${repoPath}`);
        console.error(`Clone it first: git clone <url> projects/${project}`);
        process.exit(1);
      }

      // Get branch (interactive or from argument)
      const branch = branchArg ?? (await selectBranch(project));

      // Check if branch exists
      if (!branchExists(project, branch)) {
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
      const dockerfilePath = join(JAGENT_ROOT, "Dockerfile.jaegent");
      if (!imageExists()) {
        if (!existsSync(dockerfilePath)) {
          console.error(`Dockerfile not found at ${dockerfilePath}`);
          process.exit(1);
        }
        console.log("Building Docker image...");
        buildImage(dockerfilePath);
      }

      // Create clone
      console.log(`Creating clone for branch '${branch}'...`);
      const clonePath = createClone(project, branch);
      console.log(`Clone created at ${clonePath}`);

      // Create container
      console.log("Creating container...");
      const containerId = createContainer(project, branch, clonePath);
      console.log(`Container created: ${containerId.slice(0, 12)}`);

      // Attach if requested
      if (options.attach) {
        console.log("Attaching to container...");
        attachToContainer(name);
      } else {
        console.log(`\nTo attach: jaegent attach ${name}`);
      }
    },
  );
