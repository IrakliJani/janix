import { Command } from "commander";
import { getContainerByName, removeContainer } from "../lib/docker.js";
import { removeClone } from "../lib/git.js";
import { selectContainer, confirm } from "../lib/interactive.js";

export const destroyCommand = new Command("destroy")
  .alias("rm")
  .description("Destroy a dev environment and optionally its clone")
  .argument("[container]", "Container name or ID (interactive if not provided)")
  .option("--clone", "Also remove the git clone")
  .option("-f, --force", "Skip confirmation")
  .action(async (containerArg: string | undefined, options: { clone: boolean; force: boolean }) => {
    const container = containerArg ? getContainerByName(containerArg) : await selectContainer();

    if (!container) {
      console.error(`No container found: '${containerArg}'`);
      process.exit(1);
    }

    if (!options.force) {
      const confirmed = await confirm(
        `Destroy container ${container.name}${options.clone ? " and clone" : ""}?`,
      );

      if (!confirmed) {
        console.log("Cancelled");
        return;
      }
    }

    console.log(`Removing container ${container.name}...`);
    removeContainer(container.name);
    console.log("Container removed");

    if (options.clone) {
      console.log(`Removing clone for ${container.project}/${container.branch}...`);
      removeClone(container.project, container.branch);
      console.log("Clone removed");
    }

    console.log("Done");
  });
