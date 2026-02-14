import { Command } from "commander";
import { containerName, findIkagentRoot, getProjectName } from "../lib/config.js";
import { getContainer, removeContainer } from "../lib/docker.js";
import { listClones, removeClone } from "../lib/git.js";
import { selectClone, confirm } from "../lib/interactive.js";

export const destroyCommand = new Command("destroy")
  .alias("rm")
  .description("Destroy a dev environment (removes clone and container)")
  .argument("[clone]", "Clone name or branch (interactive if not provided)")
  .option("-f, --force", "Skip confirmation")
  .action(async (cloneArg: string | undefined, options: { force: boolean }) => {
    // Verify we're in an ikagent project
    if (!findIkagentRoot()) {
      console.error("Not in an ikagent project. Run 'ikagent init' first.");
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
        console.error("Run 'ikagent list' to see available environments");
        process.exit(1);
      }
      cloneName = match.name;
    } else {
      if (clones.length === 0) {
        console.error("No clones found.");
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

    if (!options.force) {
      const confirmed = await confirm(`Destroy ${cloneName} (clone and container)?`);
      if (!confirmed) {
        console.log("Cancelled");
        return;
      }
    }

    // Remove container if it exists
    const container = getContainer(project, clone.branch);
    if (container) {
      const name = containerName(project, clone.branch);
      console.log(`Removing container ${name}...`);
      removeContainer(name);
      console.log("Container removed");
    }

    // Remove clone
    console.log(`Removing clone ${cloneName}...`);
    removeClone(clone.branch);
    console.log("Clone removed");

    console.log("Done");
  });
