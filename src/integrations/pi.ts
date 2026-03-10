import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathExists } from "../lib/fs.js";
import type { SelectableIntegration } from "./types.js";

async function resolveCredentials(): Promise<string | null> {
  const credPath = join(homedir(), ".pi", "agent", "auth.json");
  return (await pathExists(credPath)) ? await readFile(credPath, "utf-8") : null;
}

async function resolveSettings(): Promise<string | null> {
  const settingsPath = join(homedir(), ".pi", "agent", "settings.json");
  return (await pathExists(settingsPath)) ? await readFile(settingsPath, "utf-8") : null;
}

export const pi: SelectableIntegration = {
  id: "pi",
  label: "Pi Coding Agent",
  category: "agent",
  defaultSelected: false,
  dockerfileLines: [
    "RUN nix-env -iA nixpkgs.nodejs_22",
    "RUN npm install -g @mariozechner/pi-coding-agent",
  ],
  volumes: [{ name: "janix-pi", path: "/root/.pi" }],
  env: {},
  initCommands: [],
  credentials: [
    {
      label: "Pi agent credentials",
      resolve: resolveCredentials,
      containerPath: "/root/.pi/agent/auth.json",
      requiresConsent: true,
    },
    {
      label: "Pi agent settings",
      resolve: resolveSettings,
      containerPath: "/root/.pi/agent/settings.json",
    },
  ],
  nixConfig: {},
};
