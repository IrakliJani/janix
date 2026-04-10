import { Command } from "commander";
import * as Docker from "../lib/docker.js";
import { resolveClone } from "../lib/resolve-clone.js";

export const startCommand = new Command("start")
  .description("Start a stopped dev environment")
  .argument("[clone]", "Clone name or branch (interactive if not provided)")
  .action(async (cloneArg: string | undefined) => {
    const { cloneName, containerName, container } = await resolveClone(cloneArg);

    if (!container) {
      console.error(`No container found for ${cloneName}`);
      process.exit(1);
    }

    if (await Docker.isContainerRunning(containerName)) {
      console.log(`${cloneName} is already running`);
      return;
    }

    console.log(`Starting ${cloneName}...`);
    await Docker.startContainer(containerName);
    console.log("Started");
  });
