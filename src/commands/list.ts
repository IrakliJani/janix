import { Command } from "commander";
import {
  config,
  findJanixRoot,
  getProjectName,
  sanitizeBranchForContainer,
} from "../lib/config.js";
import { listContainers, type ContainerInfo } from "../lib/docker.js";
import { listClones } from "../lib/git.js";

function formatState(container: ContainerInfo | undefined): string {
  if (!container) return "\x1b[31mno container\x1b[0m";

  switch (container.state.toLowerCase()) {
    case "running":
      return "\x1b[32mrunning\x1b[0m";
    case "created":
    case "paused":
    case "restarting":
    case "exited":
      return `\x1b[33m${container.state}\x1b[0m`;
    default:
      return `\x1b[31m${container.state || "unknown"}\x1b[0m`;
  }
}

function containerBranchKey(projectPrefix: string, container: ContainerInfo): string {
  if (container.branch) return container.branch;
  if (container.name.startsWith(projectPrefix)) {
    return container.name.slice(projectPrefix.length);
  }
  return "";
}

export const listCommand = new Command("list")
  .alias("ls")
  .description("List dev environments for this project")
  .action(async () => {
    if (!(await findJanixRoot())) {
      console.error("Not in a janix project. Run 'janix init' first.");
      process.exit(1);
    }

    const project = await getProjectName();
    const clones = (await listClones()).sort((a, b) => a.branch.localeCompare(b.branch));
    const projectPrefix = `${config.containerPrefix}-${project}-`;
    const containers = (await listContainers()).filter(
      (c) => c.project === project || c.name.startsWith(projectPrefix),
    );

    if (clones.length === 0 && containers.length === 0) {
      console.log("No dev environments found");
      console.log(`\nRun 'janix create <branch>' to create one.`);
      return;
    }

    console.log(`\nDev environments for ${project}:\n`);

    const containerMap = new Map<string, ContainerInfo>();
    for (const container of containers) {
      const branchKey = containerBranchKey(projectPrefix, container);
      const keys = [branchKey, sanitizeBranchForContainer(branchKey)];
      for (const key of keys) {
        if (key) {
          containerMap.set(key, container);
        }
      }
    }

    const matchedContainers = new Set<string>();

    for (const clone of clones) {
      const sanitizedBranch = sanitizeBranchForContainer(clone.branch);
      const container = containerMap.get(clone.branch) ?? containerMap.get(sanitizedBranch);
      if (container) {
        matchedContainers.add(container.name);
      }

      console.log(`  ${clone.name}`);
      console.log(`    Branch:    ${clone.branch}`);
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
