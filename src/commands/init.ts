import { Command } from "commander";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { checkbox } from "@inquirer/prompts";
import { JANIX_DIR, CLONES_DIR, sanitizeBranchForId, sanitizeBranchSafe } from "../lib/config.js";
import { isGitRepo, addToGitignore, getCurrentBranch } from "../lib/init.js";
import { saveProjectConfig, type ProjectConfig } from "../lib/project-config.js";
import { getSelectableIntegrations, detectIntegrations } from "../integrations/index.js";
import {
  inputMultiLine,
  selectNetwork,
  selectEnvFiles,
  selectEnvOverrides,
} from "../lib/interactive.js";
import { loadEnvFiles } from "../lib/env.js";

export const initCommand = new Command("init")
  .description("Initialize janix in current git repository")
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
      console.error("janix requires a flake.nix to define the dev environment.");
      process.exit(1);
    }

    const projectName = basename(cwd);
    const currentBranch = getCurrentBranch(cwd);
    const varHint = [
      `  \u2713 $JANIX_PROJECT=${projectName}`,
      `  \u2713 $JANIX_BRANCH=${currentBranch}`,
      `  \u2713 $JANIX_BRANCH_SLUG=${sanitizeBranchForId(currentBranch)}`,
      `  \u2713 $JANIX_BRANCH_SAFE=${sanitizeBranchSafe(currentBranch)}`,
    ].join("\n");
    const janixDir = join(cwd, JANIX_DIR);

    // Check if already initialized (directory + config file must both exist)
    const configFile = join(janixDir, "config.json");
    if (existsSync(janixDir) && existsSync(configFile)) {
      console.log(`janix already initialized in ${projectName}`);
      console.log(`Config at: ${configFile}`);
      return;
    }

    console.log(`\nInitializing janix for ${projectName}...`);

    // Create .janix directory
    mkdirSync(janixDir, { recursive: true });
    console.log(`\u2713 Created ${JANIX_DIR}/`);

    // Create clones directory
    const clonesDir = join(janixDir, CLONES_DIR);
    mkdirSync(clonesDir, { recursive: true });

    console.log("\u2713 Detected flake.nix");

    // Auto-detect package manager integrations
    const detectedPMs = detectIntegrations(cwd);
    for (const pm of detectedPMs) {
      console.log(`\u2713 Detected ${pm.label}`);
    }

    // Prompt for selectable integrations (agents + shell-tools)
    const selectable = getSelectableIntegrations();
    const selectedIntegrations = await checkbox({
      message: "Select integrations:",
      choices: selectable.map((i) => ({
        name: i.label,
        value: i.id,
        checked: i.defaultSelected,
      })),
    });

    // Merge detected PMs + user-selected integrations
    const integrations = [...selectedIntegrations, ...detectedPMs.map((pm) => pm.id)];

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
      integrations,
      envFiles: selectedEnvFiles,
      envOverrides,
      network,
      init: initScripts,
      teardown: teardownScripts,
      consents: {},
    };
    saveProjectConfig(config);
    console.log(`\n\u2713 Saved ${JANIX_DIR}/config.json`);

    // Add clones to gitignore
    const gitignoreLine = `${JANIX_DIR}/${CLONES_DIR}/`;
    if (addToGitignore(cwd, gitignoreLine)) {
      console.log(`\u2713 Added ${gitignoreLine} to .gitignore`);
    }

    console.log(`\nReady! Run 'janix create <branch>' to create a dev environment.`);
  });
