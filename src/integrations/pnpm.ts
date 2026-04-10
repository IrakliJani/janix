import { join } from "node:path";
import { pathExists } from "../lib/fs.js";
import type { DetectableIntegration } from "./types.js";

export const pnpm: DetectableIntegration = {
  id: "pnpm",
  label: "pnpm",
  category: "package-manager",
  detect: async (projectRoot: string) => pathExists(join(projectRoot, "pnpm-lock.yaml")),
  dockerfileLines: [],
  volumes: [],
  env: {
    // Keep pnpm store inside the shared cache volume (/root/.cache)
    npm_config_store_dir: "/root/.cache/pnpm/store",
  },
  initCommands: [],
  credentials: [],
  nixConfig: {},
};
