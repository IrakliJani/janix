import { Command } from "commander";
import { getContainerByName, isContainerRunning, startContainer } from "../lib/docker.js";
import { selectContainer } from "../lib/interactive.js";

export const startCommand = new Command("start")
  .alias("up")
  .description("Start a stopped dev environment")
  .argument("[container]", "Container name or ID (interactive if not provided)")
  .action(async (containerArg: string | undefined) => {
    const container = containerArg ? getContainerByName(containerArg) : await selectContainer();

    if (!container) {
      console.error(`No container found: '${containerArg}'`);
      console.error("Run 'jaegent list' to see available environments");
      process.exit(1);
    }

    if (isContainerRunning(container.name)) {
      console.log(`${container.name} is already running`);
      return;
    }

    console.log(`Starting ${container.name}...`);
    startContainer(container.name);
    console.log("Started");
  });
