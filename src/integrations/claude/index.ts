import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { pathExists } from "../../lib/fs.js";
import type { SelectableIntegration } from "../types.js";

async function resolveCredentials(): Promise<string | null> {
  if (platform() === "darwin") {
    try {
      return (
        execFileSync("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        }).trim() || null
      );
    } catch {
      return null;
    }
  }

  const credPath = join(homedir(), ".claude", ".credentials.json");
  return (await pathExists(credPath)) ? await readFile(credPath, "utf-8") : null;
}

async function resolveSettings(): Promise<string | null> {
  const settingsPath = join(homedir(), ".claude", "settings.json");
  return (await pathExists(settingsPath)) ? await readFile(settingsPath, "utf-8") : null;
}

export const claude: SelectableIntegration = {
  id: "claude",
  label: "Claude Code",
  category: "agent",
  defaultSelected: true,
  volumes: [{ name: "janix-claude", path: "/root/.claude" }],
  env: {},
  credentials: [
    {
      label: "Claude Code credentials",
      resolve: resolveCredentials,
      containerPath: "/root/.claude/.credentials.json",
      requiresConsent: true,
    },
    {
      label: "Claude Code settings",
      resolve: resolveSettings,
      containerPath: "/root/.claude/settings.json",
    },
  ],
  nixConfig: {},
};
