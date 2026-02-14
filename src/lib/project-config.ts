import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getConfigPath, findIkagentRoot } from "./config.js";

export interface ProjectConfig {
  /** Files to copy from project root to each clone */
  copy: string[];
  /** Docker network to join (optional) */
  network: string | null;
  /** Init scripts to run after clone creation */
  init: string[];
}

const DEFAULT_CONFIG: ProjectConfig = {
  copy: [],
  network: null,
  init: [],
};

/**
 * Load project config from .ikagent/config.json.
 * Returns default config if file doesn't exist.
 */
export function loadProjectConfig(): ProjectConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(content) as Partial<ProjectConfig>;
    return {
      copy: parsed.copy ?? DEFAULT_CONFIG.copy,
      network: parsed.network ?? DEFAULT_CONFIG.network,
      init: parsed.init ?? DEFAULT_CONFIG.init,
    };
  } catch {
    console.warn(`Warning: Could not parse ${configPath}, using defaults`);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save project config to .ikagent/config.json.
 */
export function saveProjectConfig(config: ProjectConfig): void {
  const configPath = getConfigPath();
  const dir = dirname(configPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Check if ikagent is initialized in current directory tree.
 */
export function isInitialized(): boolean {
  return findIkagentRoot() !== null;
}
