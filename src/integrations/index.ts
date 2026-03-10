import { claude } from "./claude.js";
import { git } from "./git.js";
import { pi } from "./pi.js";
import { pnpm } from "./pnpm.js";
import { starship } from "./starship.js";
import type { DetectableIntegration, Integration, SelectableIntegration } from "./types.js";
import { vim } from "./vim.js";

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

export async function detectIntegrations(projectRoot: string): Promise<DetectableIntegration[]> {
  const detected = await Promise.all(
    ALL_INTEGRATIONS.filter(
      (i): i is DetectableIntegration => i.category === "package-manager",
    ).map(async (integration) => ({
      integration,
      matches: await integration.detect(projectRoot),
    })),
  );

  return detected.filter((entry) => entry.matches).map((entry) => entry.integration);
}
