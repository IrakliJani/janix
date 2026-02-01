import { Command } from "commander";
import { listContainers } from "../lib/docker.js";

export const listCommand = new Command("list")
  .alias("ls")
  .description("List all dev environments")
  .action(() => {
    const containers = listContainers();

    if (containers.length === 0) {
      console.log("No dev environments found");
      return;
    }

    console.log("\nDev environments:\n");

    for (const c of containers) {
      const status = c.status.toLowerCase().includes("up")
        ? "\x1b[32mrunning\x1b[0m"
        : "\x1b[33mstopped\x1b[0m";
      console.log(`  ${c.project}/${c.branch}`);
      console.log(`    Status:    ${status}`);
      console.log(`    Container: ${c.id.slice(0, 12)}\n`);
    }

    console.log(`${containers.length} environment(s)\n`);
  });
