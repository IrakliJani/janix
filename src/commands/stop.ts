import { Command } from "commander";
import { containerName, findJanixRoot, getProjectName } from "../lib/config.js";
import { getContainer, stopContainer } from "../lib/docker.js";
import { listClones } from "../lib/git.js";
import { selectClone } from "../lib/interactive.js";

export const stopCommand = new Command("stop")
  .alias("st")
  .description("Stop a dev environment (can be restarted)")
  .argument("[clone]", "Clone name or branch (interactive if not provided)")
  .action(async (cloneArg: string | undefined) => {
    // Verify we're in a janix project
    if (!findJanixRoot()) {
      console.error("Not in a janix project. Run 'janix init' first.");
      process.exit(1);
    }

    const project = getProjectName();
    const clones = listClones();

    // Get clone name
    let cloneName: string;
    if (cloneArg) {
      const match = clones.find((c) => c.name === cloneArg || c.branch === cloneArg);
      if (!match) {
        console.error(`No clone found: '${cloneArg}'`);
        console.error("Run 'janix list' to see available environments");
        process.exit(1);
      }
      cloneName = match.name;
    } else {
      if (clones.length === 0) {
        console.error("No clones found. Run 'janix create <branch>' first.");
        process.exit(1);
      }
      cloneName = await selectClone(clones);
    }

    // Find the clone to get its branch
    const clone = clones.find((c) => c.name === cloneName);
    if (!clone) {
      console.error(`Clone not found: ${cloneName}`);
      process.exit(1);
    }

    // Get container
    const container = getContainer(project, clone.branch);
    if (!container) {
      console.error(`No container found for ${cloneName}`);
      process.exit(1);
    }

    const name = containerName(project, clone.branch);

    console.log(`Stopping ${cloneName}...`);
    stopContainer(name);
    console.log("Stopped");
  });
