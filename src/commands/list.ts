import { Command } from "commander";
import { findJanixRoot, sanitizeBranchForContainer } from "../lib/config.js";
import { containerBranchKey, formatState, getEnvironments } from "../lib/environments.js";

export const listCommand = new Command("list")
  .description("List dev environments for this project")
  .action(async () => {
    if (!(await findJanixRoot())) {
      console.error("Not in a janix project. Run 'janix init' first.");
      process.exit(1);
    }

    const { project, clones, containers, containerMap, projectPrefix } = await getEnvironments();

    if (clones.length === 0 && containers.length === 0) {
      console.log("No dev environments found");
      console.log(`\nRun 'janix create <branch>' to create one.`);
      return;
    }

    console.log(`\nDev environments for ${project}:\n`);

    const matchedContainers = new Set<string>();

    for (const clone of clones) {
      const sanitizedBranch = sanitizeBranchForContainer(clone.branch);
      const container = containerMap.get(clone.branch) ?? containerMap.get(sanitizedBranch);
      if (container) {
        matchedContainers.add(container.name);
      }

      console.log(`  ${clone.name}`);
      console.log(`    Branch:    ${clone.branch}`);
      if (clone.currentBranch !== clone.branch) {
        console.log(`    Checked:   ${clone.currentBranch}`);
      }
      console.log(`    Status:    ${formatState(container)}`);
      if (container) {
        console.log(`    Container: ${container.id.slice(0, 12)}`);
        console.log(`    Docker:    ${container.status}`);
        const attachHint =
          container.state.toLowerCase() === "running"
            ? `janix attach ${clone.branch}`
            : `janix start ${clone.branch} && janix attach ${clone.branch}`;
        console.log(`    Attach:    ${attachHint}`);
      } else {
        console.log(`    Attach:    janix create ${clone.branch}`);
      }
      console.log("");
    }

    const orphans = containers.filter((container) => !matchedContainers.has(container.name));
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

    const running = containers.filter((c) => c.state.toLowerCase() === "running").length;
    const nonRunning = containers.length - running;
    console.log(
      `${clones.length} clone(s), ${containers.length} container(s) (${running} running, ${nonRunning} not running)\n`,
    );
  });
