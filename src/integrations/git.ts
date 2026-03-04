import { execFileSync } from "node:child_process";
import type { SelectableIntegration } from "./types.js";

function getGitConfig(key: string): string {
  try {
    return execFileSync("git", ["config", "--global", key], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

let _nixConfig: Record<string, string> | null = null;

function lazyNixConfig(): Record<string, string> {
  if (!_nixConfig) {
    _nixConfig = {
      userName: getGitConfig("user.name"),
      userEmail: getGitConfig("user.email"),
    };
  }
  return _nixConfig;
}

export const git: SelectableIntegration = {
  id: "git",
  label: "Git",
  category: "shell-tool",
  defaultSelected: true,
  dockerfileLines: [],
  volumes: [],
  env: {},
  initCommands: [],
  credentials: [],
  get nixConfig() {
    return lazyNixConfig();
  },
};
