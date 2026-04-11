import { encodeBranchForResource } from "./config.js";

export function buildJanixVars(project: string, branch: string): Record<string, string> {
  return {
    JANIX_BRANCH: branch,
    JANIX_PROJECT: project,
    JANIX_BRANCH_SAFE: encodeBranchForResource(branch),
  };
}

export function resolveVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g, (_, name) => vars[name] ?? `$${name}`);
}
