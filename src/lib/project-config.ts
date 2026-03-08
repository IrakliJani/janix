import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getConfigPath, findJanixRoot } from "./config.js";

export interface ProjectConfig {
  /** Active integration IDs (e.g. ["claude", "starship", "pnpm"]) */
  integrations: string[];
  /** .env files to load in order (later overrides earlier) */
  envFiles: string[];
  /** Env var overrides (values may contain $JANIX_BRANCH etc.) */
  envOverrides: Record<string, string>;
  /** Docker network to join (optional) */
  network: string | null;
  /** Init scripts to run after clone creation */
  init: string[];
  /** Teardown scripts to run before destroying the environment */
  teardown: string[];
  /** Persisted credential consent per integration */
  consents: Record<string, Record<string, boolean>>;
}

const DEFAULT_CONFIG: ProjectConfig = {
  integrations: [],
  envFiles: [],
  envOverrides: {},
  network: null,
  init: [],
  teardown: [],
  consents: {},
};

interface LegacyConfig {
  caches?: string[];
  packageManager?: string;
}

/**
 * Load project config from .janix/config.json.
 * Returns default config if file doesn't exist.
 * Migrates legacy caches/packageManager fields to integrations.
 */
export function loadProjectConfig(): ProjectConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(content) as Partial<ProjectConfig> & LegacyConfig;

    // Backward compat: migrate legacy caches field to integrations
    let integrations = parsed.integrations;
    if (!integrations && parsed.caches) {
      integrations = [...parsed.caches, "claude", "starship"];
    }

    return {
      integrations: integrations ?? DEFAULT_CONFIG.integrations,
      envFiles: parsed.envFiles ?? DEFAULT_CONFIG.envFiles,
      envOverrides: parsed.envOverrides ?? DEFAULT_CONFIG.envOverrides,
      network: parsed.network ?? DEFAULT_CONFIG.network,
      init: parsed.init ?? DEFAULT_CONFIG.init,
      teardown: parsed.teardown ?? DEFAULT_CONFIG.teardown,
      consents: parsed.consents ?? DEFAULT_CONFIG.consents,
    };
  } catch {
    console.warn(`Warning: Could not parse ${configPath}, using defaults`);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save project config to .janix/config.json.
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
 * Check if janix is initialized in current directory tree.
 */
export function isInitialized(): boolean {
  return findJanixRoot() !== null;
}
