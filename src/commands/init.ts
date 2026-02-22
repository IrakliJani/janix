import { Command } from "commander";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { IKAGENT_DIR, CLONES_DIR, sanitizeBranchForId, sanitizeBranchSafe } from "../lib/config.js";
import { isGitRepo, addToGitignore, getCurrentBranch } from "../lib/init.js";
import { saveProjectConfig, type ProjectConfig } from "../lib/project-config.js";
import { type CacheType } from "../lib/docker.js";
import {
  inputMultiLine,
  selectNetwork,
  selectEnvFiles,
  selectEnvOverrides,
} from "../lib/interactive.js";
import { loadEnvFiles } from "../lib/env.js";

function detectPackageManager(cwd: string): { pm: string; cache: CacheType } | null {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return { pm: "pnpm", cache: "pnpm" };
  if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock")))
    return { pm: "bun", cache: "bun" };
  if (existsSync(join(cwd, "yarn.lock"))) return { pm: "yarn", cache: "yarn" };
  if (existsSync(join(cwd, "package-lock.json"))) return { pm: "npm", cache: "npm" };
  return null;
}

export const initCommand = new Command("init")
  .description("Initialize ikagent in current git repository")
  .action(async () => {
    const cwd = process.cwd();

    // Verify current directory is a git repo
    if (!isGitRepo(cwd)) {
      console.error("Error: Not a git repository");
      console.error("Run 'git init' first or navigate to a git repository");
      process.exit(1);
    }

    // Require flake.nix
    if (!existsSync(join(cwd, "flake.nix"))) {
      console.error("Error: No flake.nix found in project root");
      console.error("ikagent requires a flake.nix to define the dev environment.");
      process.exit(1);
    }

    const projectName = basename(cwd);
    const currentBranch = getCurrentBranch(cwd);
    const varHint = [
      `  ✓ $IKAGENT_PROJECT=${projectName}`,
      `  ✓ $IKAGENT_BRANCH=${currentBranch}`,
      `  ✓ $IKAGENT_BRANCH_SLUG=${sanitizeBranchForId(currentBranch)}`,
      `  ✓ $IKAGENT_BRANCH_SAFE=${sanitizeBranchSafe(currentBranch)}`,
    ].join("\n");
    const ikagentDir = join(cwd, IKAGENT_DIR);

    // Check if already initialized
    if (existsSync(ikagentDir)) {
      console.log(`ikagent already initialized in ${projectName}`);
      console.log(`Config at: ${ikagentDir}/config.json`);
      return;
    }

    console.log(`\nInitializing ikagent for ${projectName}...`);

    // Create .ikagent directory
    mkdirSync(ikagentDir, { recursive: true });
    console.log(`✓ Created ${IKAGENT_DIR}/`);

    // Create clones directory
    const clonesDir = join(ikagentDir, CLONES_DIR);
    mkdirSync(clonesDir, { recursive: true });

    console.log("✓ Detected flake.nix");

    // Auto-detect package manager from lock files
    let caches: CacheType[] = [];
    const detected = detectPackageManager(cwd);
    if (detected) {
      caches = [detected.cache];
      console.log(`✓ Detected ${detected.pm} (cache: ${detected.cache})`);
    }

    // Find available .env files
    const envFiles = readdirSync(cwd).filter(
      (f) => f.startsWith(".env") && !f.endsWith(".example") && !f.endsWith(".sample"),
    );

    let selectedEnvFiles: string[] = [];
    let envOverrides: Record<string, string> = {};
    if (envFiles.length > 0) {
      console.log("");
      selectedEnvFiles = await selectEnvFiles(envFiles);

      if (selectedEnvFiles.length > 0) {
        const envVars = loadEnvFiles(selectedEnvFiles, cwd);
        if (Object.keys(envVars).length > 0) {
          console.log("\n  Available vars:");
          console.log(varHint);
          envOverrides = await selectEnvOverrides(envVars);
        }
      }
    }

    console.log("");
    const network = await selectNetwork();

    console.log("");
    console.log("  Available vars:");
    console.log(varHint);
    const initScripts = await inputMultiLine("Init scripts to run:");

    console.log("  Available vars:");
    console.log(varHint);
    const teardownScripts = await inputMultiLine("Teardown scripts to run on destroy:");

    // Save config
    const config: ProjectConfig = {
      packageManager: detected?.pm ?? "npm",
      envFiles: selectedEnvFiles,
      envOverrides,
      network,
      caches,
      init: initScripts,
      teardown: teardownScripts,
    };
    saveProjectConfig(config);
    console.log(`\n✓ Saved ${IKAGENT_DIR}/config.json`);

    // Add clones to gitignore
    const gitignoreLine = `${IKAGENT_DIR}/${CLONES_DIR}/`;
    if (addToGitignore(cwd, gitignoreLine)) {
      console.log(`✓ Added ${gitignoreLine} to .gitignore`);
    }

    console.log(`\nReady! Run 'ikagent create <branch>' to create a dev environment.`);
  });
