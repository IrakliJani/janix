import { Command } from "commander";
import {
  config,
  findJanixRoot,
  getProjectName,
  sanitizeBranchForContainer,
} from "../lib/config.js";
import { listContainers } from "../lib/docker.js";
import { listClones } from "../lib/git.js";

export const listCommand = new Command("list")
  .alias("ls")
  .description("List dev environments for this project")
  .action(() => {
    // Verify we're in a janix project
    if (!findJanixRoot()) {
      console.error("Not in a janix project. Run 'janix init' first.");
      process.exit(1);
    }

    const project = getProjectName();

    // Get clones
    const clones = listClones();

    // Get containers for this project by name prefix to support hyphenated project names.
    const projectPrefix = `${config.containerPrefix}-${project}-`;
    const containers = listContainers().filter((c) => c.name.startsWith(projectPrefix));

    if (clones.length === 0 && containers.length === 0) {
      console.log("No dev environments found");
      console.log(`\nRun 'janix create <branch>' to create one.`);
      return;
    }

    console.log(`\nDev environments for ${project}:\n`);

    // Map sanitized branch -> container.
    const containerMap = new Map(containers.map((c) => [c.name.slice(projectPrefix.length), c]));

    for (const clone of clones) {
      const sanitizedBranch = sanitizeBranchForContainer(clone.branch);
      const container = containerMap.get(sanitizedBranch);
      const status = container
        ? container.status.toLowerCase().includes("up")
          ? "\x1b[32mrunning\x1b[0m"
          : "\x1b[33mstopped\x1b[0m"
        : "\x1b[31mno container\x1b[0m";

      console.log(`  ${clone.name}`);
      console.log(`    Branch:    ${clone.branch}`);
      console.log(`    Status:    ${status}`);
      if (container) {
        console.log(`    Container: ${container.id.slice(0, 12)}`);
      }
      console.log("");
    }

    console.log(`${clones.length} environment(s)\n`);
  });
