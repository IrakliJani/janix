import { Command } from "commander";
import * as Docker from "../lib/docker.js";
import { resolveClone } from "../lib/resolve-clone.js";

export const attachCommand = new Command("attach")
  .description("Attach to an existing dev environment")
  .argument("[clone]", "Clone name or branch (interactive if not provided)")
  .action(async (cloneArg: string | undefined) => {
    const { containerName, container } = await resolveClone(cloneArg);

    if (!container) {
      console.error(`No container found for ${containerName}`);
      console.error("The container may have been removed. Run 'janix create' to recreate it.");
      process.exit(1);
    }

    if (!(await Docker.isContainerRunning(containerName))) {
      console.log("Starting stopped container...");
      await Docker.startContainer(containerName);
    }

    console.log(`Attaching to ${containerName}...`);
    Docker.attachToContainer(containerName);
  });
