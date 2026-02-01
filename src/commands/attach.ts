import { Command } from "commander";
import {
  attachToContainer,
  getContainerByName,
  isContainerRunning,
  startContainer,
} from "../lib/docker.js";
import { selectContainer } from "../lib/interactive.js";

export const attachCommand = new Command("attach")
  .alias("at")
  .description("Attach to an existing dev environment")
  .argument("[container]", "Container name or ID (interactive if not provided)")
  .action(async (containerArg: string | undefined) => {
    const container = containerArg ? getContainerByName(containerArg) : await selectContainer();

    if (!container) {
      console.error(`No container found: '${containerArg}'`);
      console.error("Run 'jaegent list' to see available environments");
      process.exit(1);
    }

    if (!isContainerRunning(container.name)) {
      console.log("Starting stopped container...");
      startContainer(container.name);
    }

    console.log(`Attaching to ${container.name}...`);
    attachToContainer(container.name);
  });
