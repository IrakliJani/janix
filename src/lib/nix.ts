import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Integration } from "../integrations/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUPPORT_DIR = resolve(__dirname, "../../support");

export const HOME_NIX = readFileSync(join(SUPPORT_DIR, "nix/home.nix.template"), "utf-8");
export const DOCKERFILE_TEMPLATE = readFileSync(
  join(SUPPORT_DIR, "docker/Dockerfile.template"),
  "utf-8",
);

function escapeNixString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$\{/g, "\\${");
}

// TODO: this is unreadable as fuck, is there a json to nix object converter? :D
export function generateIntegrationsNix(
  ids: string[],
  nixConfigs: { id: string; config: Record<string, string> }[],
): string {
  const lines: string[] = [];
  lines.push(`  ids = [ ${ids.map((id) => `"${id}"`).join(" ")} ];`);
  for (const { id, config } of nixConfigs) {
    const entries = Object.entries(config);
    if (entries.length === 0) continue;
    lines.push(`  ${id} = {`);
    for (const [k, v] of entries) {
      lines.push(`    ${k} = "${escapeNixString(v)}";`);
    }
    lines.push(`  };`);
  }
  return `{\n${lines.join("\n")}\n}\n`;
}

export function getNixConfigs(
  resolved: Integration[],
): { id: string; config: Record<string, string> }[] {
  return resolved
    .filter((i) => Object.keys(i.nixConfig).length > 0)
    .map((i) => ({ id: i.id, config: i.nixConfig }));
}
