import { Command } from "commander";
import * as Docker from "../lib/docker.js";
import { resolveClone } from "../lib/resolve-clone.js";

export const stopCommand = new Command("stop")
  .description("Stop a dev environment (can be restarted)")
  .argument("[clone]", "Clone name or branch (interactive if not provided)")
  .action(async (cloneArg: string | undefined) => {
    const { cloneName, containerName, container } = await resolveClone(cloneArg);

    if (!container) {
      console.error(`No container found for ${cloneName}`);
      process.exit(1);
    }

    console.log(`Stopping ${cloneName}...`);
    await Docker.stopContainer(containerName);
    console.log("Stopped");
  });
