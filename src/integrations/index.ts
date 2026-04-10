import { claude } from "./claude/index.js";
import { ghostty } from "./ghostty/index.js";
import { git } from "./git/index.js";
import { pi } from "./pi/index.js";
import { pnpm } from "./pnpm/index.js";
import { ohmyposh } from "./ohmyposh/index.js";
import type { DetectableIntegration, Integration, SelectableIntegration } from "./types.js";
import { vim } from "./vim/index.js";

export type {
  Integration,
  SelectableIntegration,
  DetectableIntegration,
  Credential,
} from "./types.js";

export const ALL_INTEGRATIONS: Integration[] = [claude, git, pi, ghostty, ohmyposh, vim, pnpm];

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
