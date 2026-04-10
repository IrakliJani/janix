import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_INTEGRATIONS } from "../integrations/index.js";
import type { Integration } from "../integrations/index.js";
import { config } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUPPORT_DIR = resolve(__dirname, "../../support");

let _dockerfile: string | undefined;

export async function getDockerfile(): Promise<string> {
  _dockerfile ??= await readFile(join(SUPPORT_DIR, "docker/Dockerfile"), "utf-8");
  return _dockerfile;
}

export async function getContainerFlake(): Promise<string> {
  return readFile(join(SUPPORT_DIR, "nix/flake.nix"), "utf-8");
}

export async function getContainerFlakeLock(): Promise<string> {
  return readFile(join(SUPPORT_DIR, "nix/flake.lock"), "utf-8");
}

export async function getBaseModule(): Promise<string> {
  return readFile(join(SUPPORT_DIR, "nix/modules/base.nix"), "utf-8");
}

export interface IntegrationModule {
  id: string;
  content: string;
}

async function readIntegrationModule(id: string): Promise<IntegrationModule | null> {
  try {
    const content = await readFile(join(SUPPORT_DIR, "nix/modules", `${id}.nix`), "utf-8");
    return { id, content };
  } catch {
    // No module.nix for this integration (e.g., pnpm) — skip
    return null;
  }
}

export async function getIntegrationModules(ids: string[]): Promise<IntegrationModule[]> {
  const modules: IntegrationModule[] = [];
  for (const id of ids) {
    const module = await readIntegrationModule(id);
    if (module) {
      modules.push(module);
    }
  }
  return modules;
}

export async function getAllIntegrationModules(): Promise<IntegrationModule[]> {
  return (
    await Promise.all(ALL_INTEGRATIONS.map((integration) => readIntegrationModule(integration.id)))
  ).filter((module): module is IntegrationModule => module !== null);
}

interface NixAttrSet {
  [key: string]: NixValue;
}

type NixValue = string | string[] | NixAttrSet;

function escapeNixString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$\{/g, "\\${");
}

function renderNixValue(value: NixValue, indent = 0): string {
  if (typeof value === "string") {
    return `"${escapeNixString(value)}"`;
  }

  if (Array.isArray(value)) {
    return `[ ${value.map((item) => renderNixValue(item, indent)).join(" ")} ]`;
  }

  return renderNixAttrSet(value, indent);
}

function renderNixAttrSet(attrs: Record<string, NixValue>, indent = 0): string {
  const pad = " ".repeat(indent);
  const innerPad = " ".repeat(indent + 2);
  const entries = Object.entries(attrs);

  if (entries.length === 0) {
    return "{ }";
  }

  return [
    "{",
    ...entries.map(([key, value]) => `${innerPad}${key} = ${renderNixValue(value, indent + 2)};`),
    `${pad}}`,
  ].join("\n");
}

export function generateIntegrationsNix(
  ids: string[],
  nixConfigs: { id: string; config: Record<string, string> }[],
): string {
  const integrations: Record<string, NixValue> = {
    ids,
    workspace: config.containerWorkspace,
  };

  for (const { id, config: nixConfig } of nixConfigs) {
    if (Object.keys(nixConfig).length === 0) continue;
    integrations[id] = nixConfig;
  }

  return `${renderNixAttrSet(integrations)}\n`;
}

export function getNixConfigs(
  resolved: Integration[],
): { id: string; config: Record<string, string> }[] {
  return resolved
    .filter((i) => Object.keys(i.nixConfig).length > 0)
    .map((i) => ({ id: i.id, config: i.nixConfig }));
}
