import { Command } from "commander";
import { existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { IKAGENT_DIR, CLONES_DIR } from "../lib/config.js";
import { isGitRepo, addToGitignore } from "../lib/init.js";
import { writePackagesNix } from "../lib/nix.js";
import { saveProjectConfig, type ProjectConfig } from "../lib/project-config.js";
import {
  inputMultiLine,
  selectCaches,
  selectEnvironments,
  selectNetwork,
  selectPackageManager,
} from "../lib/interactive.js";

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

    const projectName = basename(cwd);
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

    // Interactive prompts - environment first
    console.log("");
    const envs = await selectEnvironments();

    const packageManager = await selectPackageManager();

    console.log("");
    const caches = await selectCaches();

    console.log("");
    const network = await selectNetwork();

    console.log("");
    const copyFiles = await inputMultiLine("Files to copy to clones:");

    console.log("");
    const initScripts = await inputMultiLine("Init scripts to run:");

    // Save config
    const config: ProjectConfig = {
      envs,
      packageManager,
      copy: copyFiles,
      network,
      caches,
      init: initScripts,
    };
    saveProjectConfig(config);
    console.log(`\n✓ Saved ${IKAGENT_DIR}/config.json`);

    // Generate packages.nix
    writePackagesNix(ikagentDir, config);
    console.log(`✓ Generated ${IKAGENT_DIR}/packages.nix`);

    // Add clones to gitignore
    const gitignoreLine = `${IKAGENT_DIR}/${CLONES_DIR}/`;
    if (addToGitignore(cwd, gitignoreLine)) {
      console.log(`✓ Added ${gitignoreLine} to .gitignore`);
    }

    console.log(`\nReady! Run 'ikagent create <branch>' to create a dev environment.`);
  });
