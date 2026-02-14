import { confirm as inquirerConfirm, input } from "@inquirer/prompts";
import search from "@inquirer/search";
import { getProjectRoot } from "./config.js";
import { listBranches, fetchAll } from "./git.js";
import { listContainers, listNetworks, type ContainerInfo } from "./docker.js";

export async function selectBranch(): Promise<string> {
  const projectRoot = getProjectRoot();

  console.log("Fetching branches...");
  fetchAll(projectRoot);
  const branches = listBranches(projectRoot);
  const uniqueBranches = [...new Set(branches)].sort();
  console.log(`${uniqueBranches.length} branches loaded`);

  const branch = await search({
    message: "Search for a branch:",
    source: async (term: string | undefined) => {
      const searchTerm = term?.toLowerCase() ?? "";
      return uniqueBranches
        .filter((b) => b.toLowerCase().includes(searchTerm))
        .slice(0, 20)
        .map((b) => ({ name: b, value: b }));
    },
  });

  return branch;
}

export async function selectContainer(): Promise<ContainerInfo> {
  const containers = listContainers();

  if (containers.length === 0) {
    console.error("No containers found");
    process.exit(1);
  }

  const container = await search({
    message: "Search for a container:",
    source: async (term: string | undefined) => {
      const searchTerm = term?.toLowerCase() ?? "";
      return containers
        .filter((c) => `${c.project}/${c.branch}`.toLowerCase().includes(searchTerm))
        .slice(0, 20)
        .map((c) => ({
          value: c,
          name: `${c.project}/${c.branch}`,
          description: c.status.toLowerCase().includes("up") ? "running" : "stopped",
        }));
    },
  });

  return container;
}

export async function selectClone(
  clones: Array<{ name: string; branch: string }>,
): Promise<string> {
  if (clones.length === 0) {
    console.error("No clones found");
    process.exit(1);
  }

  const clone = await search({
    message: "Search for a clone:",
    source: async (term: string | undefined) => {
      const searchTerm = term?.toLowerCase() ?? "";
      return clones
        .filter(
          (c) =>
            c.name.toLowerCase().includes(searchTerm) ||
            c.branch.toLowerCase().includes(searchTerm),
        )
        .slice(0, 20)
        .map((c) => ({
          value: c.name,
          name: c.name,
          description: `branch: ${c.branch}`,
        }));
    },
  });

  return clone;
}

export async function selectNetwork(): Promise<string | null> {
  const networks = listNetworks();

  // Add skip option
  const options = [
    { name: "(skip)", value: null as string | null },
    ...networks.map((n) => ({ name: n, value: n as string | null })),
  ];

  const network = await search({
    message: "Docker network to join:",
    source: async (term: string | undefined) => {
      const searchTerm = term?.toLowerCase() ?? "";
      return options.filter((o) => o.name.toLowerCase().includes(searchTerm)).slice(0, 20);
    },
  });

  return network;
}

/**
 * Prompt for multiple lines of input (paths, scripts, etc.).
 * Empty line finishes input.
 */
export async function inputMultiLine(prompt: string): Promise<string[]> {
  console.log(prompt);
  console.log("  (Enter paths one at a time, empty line to finish)");

  const lines: string[] = [];

  while (true) {
    const line = await input({ message: ">" });
    if (line.trim() === "") {
      break;
    }
    lines.push(line.trim());
  }

  return lines;
}

export async function confirm(message: string): Promise<boolean> {
  return inquirerConfirm({ message, default: false });
}
