import type { Integration, SelectableIntegration, DetectableIntegration } from "./types.js";
import { claude } from "./claude.js";
import { git } from "./git.js";
import { pi } from "./pi.js";
import { starship } from "./starship.js";
import { vim } from "./vim.js";
import { pnpm } from "./pnpm.js";

export type {
  Integration,
  SelectableIntegration,
  DetectableIntegration,
  Credential,
} from "./types.js";

export const ALL_INTEGRATIONS: Integration[] = [claude, git, pi, starship, vim, pnpm];

export function resolveIntegrations(ids: string[]): Integration[] {
  return ids.flatMap((id) => {
    const integration = ALL_INTEGRATIONS.find((i) => i.id === id);
    return integration ? [integration] : [];
  });
}

export function getSelectableIntegrations(): SelectableIntegration[] {
  return ALL_INTEGRATIONS.filter(
    (i): i is SelectableIntegration => i.category === "agent" || i.category === "shell-tool",
  );
}

export function detectIntegrations(projectRoot: string): DetectableIntegration[] {
  return ALL_INTEGRATIONS.filter(
    (i): i is DetectableIntegration => i.category === "package-manager" && i.detect(projectRoot),
  );
}
