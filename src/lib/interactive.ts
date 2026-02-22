import { confirm as inquirerConfirm, input } from "@inquirer/prompts";
import search from "@inquirer/search";
import { getProjectRoot } from "./config.js";
import { listBranches, fetchAllAsync } from "./git.js";
import { listContainers, listNetworks, type ContainerInfo } from "./docker.js";

export async function selectBranch(): Promise<string> {
  const projectRoot = getProjectRoot();

  // Start with local branches immediately
  let branches = listBranches(projectRoot);
  let isFetching = true;

  // Fetch remote branches in background
  fetchAllAsync(projectRoot)
    .then(() => {
      branches = listBranches(projectRoot);
      isFetching = false;
    })
    .catch(() => {
      isFetching = false;
    });

  const branch = await search({
    message: "Search for a branch:",
    source: async (term: string | undefined) => {
      const searchTerm = term?.toLowerCase() ?? "";
      const filtered = branches
        .filter((b) => b.name.toLowerCase().includes(searchTerm))
        .slice(0, 20)
        .map((b) => ({
          name: b.name,
          value: b.name,
          ...(b.author ? { description: b.author } : {}),
        }));

      // Add loading indicator if still fetching
      if (isFetching && filtered.length < 20) {
        filtered.push({ name: "⏳ Fetching remote branches...", value: "__loading__" });
      }

      return filtered;
    },
  });

  // If user somehow selected loading indicator, wait and retry
  if (branch === "__loading__") {
    return selectBranch();
  }

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

const DONE = "__done__";

/**
 * Select .env files in load order (each pick appends to the ordered list).
 */
export async function selectEnvFiles(available: string[]): Promise<string[]> {
  const selected: string[] = [];

  while (true) {
    const remaining = available.filter((f) => !selected.includes(f));
    const label =
      selected.length > 0 ? `Add .env file (order: ${selected.join(" → ")}):` : "Add .env file:";

    const file = await search({
      message: label,
      source: async (term) => {
        const q = term?.toLowerCase() ?? "";
        return [
          { name: "(done)", value: DONE },
          ...selected.map((f, i) => ({ name: `${i + 1}. ✓ ${f}  [remove]`, value: `remove:${f}` })),
          ...remaining
            .filter((f) => f.toLowerCase().includes(q))
            .map((f) => ({ name: f, value: f })),
        ];
      },
    });

    if (file === DONE) break;
    if (file.startsWith("remove:")) {
      selected.splice(selected.indexOf(file.slice(7)), 1);
    } else {
      selected.push(file);
    }
  }

  return selected;
}

/**
 * Prompt to override specific env vars. Shows keys only (no values).
 */
export async function selectEnvOverrides(
  vars: Record<string, string>,
): Promise<Record<string, string>> {
  const overrides: Record<string, string> = {};
  const keys = Object.keys(vars).sort();

  while (true) {
    const overrideCount = Object.keys(overrides).length;
    const key = await search({
      message:
        overrideCount > 0
          ? `Override env var (${overrideCount} overridden):`
          : "Override env var (or done to skip):",
      source: async (term) => {
        const q = term?.toLowerCase() ?? "";
        return [
          { name: "(done)", value: DONE },
          ...keys
            .filter((k) => k.toLowerCase().includes(q))
            .map((k) => ({
              name: overrides[k] !== undefined ? `${k}  ✓` : k,
              value: k,
            })),
        ];
      },
    });

    if (key === DONE) break;
    const value = await input({ message: `${key}=` });
    overrides[key] = value;
  }

  return overrides;
}
