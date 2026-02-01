import { confirm as inquirerConfirm } from "@inquirer/prompts";
import search from "@inquirer/search";
import { readdirSync } from "node:fs";
import { config } from "./config.js";
import { listBranches, fetchAll } from "./git.js";
import { listContainers, type ContainerInfo } from "./docker.js";

export async function selectProject(): Promise<string> {
  const projects = readdirSync(config.projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name);

  if (projects.length === 0) {
    console.error(`No projects found in ${config.projectsDir}`);
    process.exit(1);
  }

  if (projects.length === 1 && projects[0] !== undefined) {
    return projects[0];
  }

  const project = await search({
    message: "Search for a project:",
    source: async (input: string | undefined) => {
      const term = input?.toLowerCase() ?? "";
      return projects
        .filter((p) => p.toLowerCase().includes(term))
        .slice(0, 20)
        .map((p) => ({ name: p, value: p }));
    },
  });

  return project;
}

export async function selectBranch(project: string): Promise<string> {
  console.log("Fetching branches...");
  fetchAll(project);
  const branches = listBranches(project);
  const uniqueBranches = [...new Set(branches)].sort();
  console.log(`${uniqueBranches.length} branches loaded`);

  const branch = await search({
    message: "Search for a branch:",
    source: async (input: string | undefined) => {
      const term = input?.toLowerCase() ?? "";
      return uniqueBranches
        .filter((b) => b.toLowerCase().includes(term))
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
    source: async (input: string | undefined) => {
      const term = input?.toLowerCase() ?? "";
      return containers
        .filter((c) => `${c.project}/${c.branch}`.toLowerCase().includes(term))
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

export async function confirm(message: string): Promise<boolean> {
  return inquirerConfirm({ message, default: false });
}
