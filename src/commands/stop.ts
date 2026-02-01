import { Command } from "commander";
import { getContainerByName, stopContainer } from "../lib/docker.js";
import { selectContainer } from "../lib/interactive.js";

export const stopCommand = new Command("stop")
  .alias("st")
  .description("Stop a dev environment (can be restarted)")
  .argument("[container]", "Container name or ID (interactive if not provided)")
  .action(async (containerArg: string | undefined) => {
    const container = containerArg ? getContainerByName(containerArg) : await selectContainer();

    if (!container) {
      console.error(`No container found: '${containerArg}'`);
      console.error("Run 'jaegent list' to see available environments");
      process.exit(1);
    }

    console.log(`Stopping ${container.name}...`);
    stopContainer(container.name);
    console.log("Stopped");
  });
