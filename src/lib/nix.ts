import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Integration } from "../integrations/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUPPORT_DIR = resolve(__dirname, "../../support");

let _homeNix: string | undefined;
let _dockerfileTemplate: string | undefined;

export async function getHomeNix(): Promise<string> {
  _homeNix ??= await readFile(join(SUPPORT_DIR, "nix/home.nix.template"), "utf-8");
  return _homeNix;
}

export async function getDockerfileTemplate(): Promise<string> {
  _dockerfileTemplate ??= await readFile(join(SUPPORT_DIR, "docker/Dockerfile.template"), "utf-8");
  return _dockerfileTemplate;
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
  };

  for (const { id, config } of nixConfigs) {
    if (Object.keys(config).length === 0) continue;
    integrations[id] = config;
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
