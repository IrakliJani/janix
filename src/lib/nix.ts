import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ProjectConfig } from "./project-config.js";

/** Map package manager to nix package name */
const PACKAGE_MANAGER_NIX: Record<string, string | null> = {
  pnpm: "pnpm",
  npm: null, // included with nodejs
  bun: "bun",
  yarn: "yarn",
};

/** Map environment to nix packages */
const ENV_NIX: Record<string, string[]> = {
  nodejs: ["nodejs"],
  python: ["python3"],
};

/**
 * Generate the contents of packages.nix for a project.
 * This is a simple nix expression that builds a combined environment.
 */
export function generatePackagesNix(config: ProjectConfig): string {
  const packages: string[] = [];

  // Add environment packages
  for (const env of config.envs) {
    const envPackages = ENV_NIX[env] ?? [];
    packages.push(...envPackages);
  }

  // Add package manager (if not npm, which comes with nodejs)
  const pmPackage = PACKAGE_MANAGER_NIX[config.packageManager];
  if (pmPackage) {
    packages.push(pmPackage);
  }

  const packageList = packages.map((p) => `    ${p}`).join("\n");

  return `# Project-specific packages
let
  pkgs = import <nixpkgs> {};
in
pkgs.buildEnv {
  name = "project-packages";
  paths = with pkgs; [
${packageList}
  ];
}
`;
}

/**
 * Write packages.nix to the project's .ikagent directory.
 */
export function writePackagesNix(ikagentDir: string, config: ProjectConfig): void {
  const content = generatePackagesNix(config);
  const path = join(ikagentDir, "packages.nix");
  writeFileSync(path, content);
}
