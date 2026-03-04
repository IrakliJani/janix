import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SelectableIntegration } from "./types.js";

function resolveCredentials(): string | null {
  const credPath = join(homedir(), ".pi", "agent", "auth.json");
  return existsSync(credPath) ? readFileSync(credPath, "utf-8") : null;
}

function resolveSettings(): string | null {
  const settingsPath = join(homedir(), ".pi", "agent", "settings.json");
  return existsSync(settingsPath) ? readFileSync(settingsPath, "utf-8") : null;
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
    },
    {
      label: "Pi agent settings",
      resolve: resolveSettings,
      containerPath: "/root/.pi/agent/settings.json",
    },
  ],
  nixConfig: {},
};
