import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getConfigPath, findIkagentRoot } from "./config.js";
import { type CacheType } from "./docker.js";

export interface ProjectConfig {
  /** Package manager */
  packageManager: string;
  /** .env files to load in order (later overrides earlier) */
  envFiles: string[];
  /** Env var overrides (values may contain $IKAGENT_BRANCH etc.) */
  envOverrides: Record<string, string>;
  /** Docker network to join (optional) */
  network: string | null;
  /** Init scripts to run after clone creation */
  init: string[];
  /** Teardown scripts to run before destroying the environment */
  teardown: string[];
  /** Package manager caches to mount (pnpm, bun, npm, yarn) */
  caches: CacheType[];
}

const DEFAULT_CONFIG: ProjectConfig = {
  packageManager: "npm",
  envFiles: [],
  envOverrides: {},
  network: null,
  init: [],
  teardown: [],
  caches: [],
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
      packageManager: parsed.packageManager ?? DEFAULT_CONFIG.packageManager,
      envFiles: parsed.envFiles ?? DEFAULT_CONFIG.envFiles,
      envOverrides: parsed.envOverrides ?? DEFAULT_CONFIG.envOverrides,
      network: parsed.network ?? DEFAULT_CONFIG.network,
      init: parsed.init ?? DEFAULT_CONFIG.init,
      teardown: parsed.teardown ?? DEFAULT_CONFIG.teardown,
      caches: parsed.caches ?? DEFAULT_CONFIG.caches,
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
