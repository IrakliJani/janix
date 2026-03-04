import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DetectableIntegration } from "./types.js";

export const pnpm: DetectableIntegration = {
  id: "pnpm",
  label: "pnpm",
  category: "package-manager",
  detect: (projectRoot: string) => existsSync(join(projectRoot, "pnpm-lock.yaml")),
  dockerfileLines: [],
  volumes: [],
  env: {},
  initCommands: [
    "mkdir -p /root/.cache/pnpm/store",
    "pnpm config set store-dir /root/.cache/pnpm/store",
  ],
  credentials: [],
  nixConfig: {},
};
