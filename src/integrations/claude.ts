import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { config } from "../lib/config.js";
import { pathExists } from "../lib/fs.js";
import type { SelectableIntegration } from "./types.js";

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

const ONBOARDING_JSON = JSON.stringify({
  hasCompletedOnboarding: true,
  hasCompletedProjectOnboarding: true,
  theme: "dark",
  projects: {
    [config.containerWorkspace]: {
      hasTrustDialogAccepted: true,
      hasCompletedProjectOnboarding: true,
    },
  },
});

export const claude: SelectableIntegration = {
  id: "claude",
  label: "Claude Code",
  category: "agent",
  defaultSelected: true,
  dockerfileLines: [`RUN cat <<'ONBOARDING' > /root/.claude.json\n${ONBOARDING_JSON}\nONBOARDING`],
  volumes: [{ name: "janix-claude", path: "/root/.claude" }],
  env: {},
  initCommands: [],
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
