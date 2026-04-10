import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { findJanixRoot, getConfigPath } from "./config.js";
import { pathExists } from "./fs.js";

export interface ProjectConfig {
  integrations: string[];
  envFiles: string[];
  envOverrides: Record<string, string>;
  network: string | null;
  init: string[];
  teardown: string[];
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

export async function loadProjectConfig(): Promise<ProjectConfig> {
  const configPath = await getConfigPath();

  if (!(await pathExists(configPath))) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(content) as Partial<ProjectConfig>;

    return {
      integrations: parsed.integrations ?? DEFAULT_CONFIG.integrations,
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

export async function saveProjectConfig(config: ProjectConfig): Promise<void> {
  const configPath = await getConfigPath();
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
}

export async function isInitialized(): Promise<boolean> {
  return (await findJanixRoot()) !== null;
}
