import { Command } from "commander";
import { findJanixRoot, sanitizeBranchForContainer } from "../lib/config.js";
import { containerBranchKey, formatState, getEnvironments } from "../lib/environments.js";

export const psCommand = new Command("ps")
  .description("List running dev environments")
  .action(async () => {
    if (!(await findJanixRoot())) {
      console.error("Not in a janix project. Run 'janix init' first.");
      process.exit(1);
    }

    const { project, clones, containerMap, containers, projectPrefix } = await getEnvironments();

    const running = containers.filter((c) => c.state.toLowerCase() === "running");

    if (running.length === 0) {
      console.log("No running environments");
      return;
    }

    console.log(`\nRunning environments for ${project}:\n`);

    const matchedContainers = new Set<string>();

    for (const clone of clones) {
      const sanitizedBranch = sanitizeBranchForContainer(clone.branch);
      const container = containerMap.get(clone.branch) ?? containerMap.get(sanitizedBranch);
      if (!container || container.state.toLowerCase() !== "running") continue;
      matchedContainers.add(container.name);

      console.log(`  ${clone.name}`);
      console.log(`    Branch:    ${clone.branch}`);
      if (clone.currentBranch !== clone.branch) {
        console.log(`    Checked:   ${clone.currentBranch}`);
      }
      console.log(`    Status:    ${formatState(container)}`);
      console.log(`    Container: ${container.id.slice(0, 12)}`);
      console.log(`    Docker:    ${container.status}`);
      console.log(`    Attach:    janix attach ${clone.branch}`);
      console.log("");
    }

    const orphans = running.filter((c) => !matchedContainers.has(c.name));
    if (orphans.length > 0) {
      console.log("Orphan containers:\n");
      for (const container of orphans) {
        const branch = containerBranchKey(projectPrefix, container) || "(unknown)";
        console.log(`  ${container.name}`);
        console.log(`    Branch:    ${branch}`);
        console.log(`    Status:    ${formatState(container)}`);
        console.log(`    Container: ${container.id.slice(0, 12)}`);
        console.log(`    Docker:    ${container.status}`);
        console.log("    Clone:     missing");
        console.log(`    Cleanup:   docker rm -f ${container.name}`);
        console.log("");
      }
    }

    console.log(`${running.length} running container(s)\n`);
  });
