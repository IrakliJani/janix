import { Command } from "commander";
import { existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { IKAGENT_DIR, CLONES_DIR } from "../lib/config.js";
import { isGitRepo, addToGitignore } from "../lib/init.js";
import {
  saveProjectConfig,
  type ProjectConfig,
} from "../lib/project-config.js";
import { inputMultiLine, selectNetwork } from "../lib/interactive.js";

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

    // Interactive prompts
    console.log("");
    const copyFiles = await inputMultiLine("Files to copy to clones:");

    console.log("");
    const network = await selectNetwork();

    console.log("");
    const initScripts = await inputMultiLine("Init scripts to run:");

    // Save config
    const config: ProjectConfig = {
      copy: copyFiles,
      network,
      init: initScripts,
    };
    saveProjectConfig(config);
    console.log(`\n✓ Saved ${IKAGENT_DIR}/config.json`);

    // Add clones to gitignore
    const gitignoreLine = `${IKAGENT_DIR}/${CLONES_DIR}/`;
    if (addToGitignore(cwd, gitignoreLine)) {
      console.log(`✓ Added ${gitignoreLine} to .gitignore`);
    }

    console.log(
      `\nReady! Run 'ikagent create <branch>' to create a dev environment.`,
    );
  });
