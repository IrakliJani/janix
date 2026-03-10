import { Command } from "commander";
import { containerName, findJanixRoot, getProjectName } from "../lib/config.js";
import { getContainer, isContainerRunning, startContainer } from "../lib/docker.js";
import { listClones } from "../lib/git.js";
import { selectClone } from "../lib/interactive.js";

export const startCommand = new Command("start")
  .alias("up")
  .description("Start a stopped dev environment")
  .argument("[clone]", "Clone name or branch (interactive if not provided)")
  .action(async (cloneArg: string | undefined) => {
    if (!(await findJanixRoot())) {
      console.error("Not in a janix project. Run 'janix init' first.");
      process.exit(1);
    }

    const project = await getProjectName();
    const clones = await listClones();

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

    const clone = clones.find((c) => c.name === cloneName);
    if (!clone) {
      console.error(`Clone not found: ${cloneName}`);
      process.exit(1);
    }

    const container = await getContainer(project, clone.branch);
    if (!container) {
      console.error(`No container found for ${cloneName}`);
      process.exit(1);
    }

    const name = containerName(project, clone.branch);

    if (await isContainerRunning(name)) {
      console.log(`${cloneName} is already running`);
      return;
    }

    console.log(`Starting ${cloneName}...`);
    await startContainer(name);
    console.log("Started");
  });
