import { mkdir, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { checkbox } from "@inquirer/prompts";
import { Command } from "commander";
import { JANIX_DIR, CLONES_DIR, encodeBranchForResource } from "../lib/config.js";
import { loadEnvFiles } from "../lib/env.js";
import { pathExists } from "../lib/fs.js";
import { getCurrentBranch, isGitRepo } from "../lib/git.js";
import { addToGitignore } from "../lib/init.js";
import { getSelectableIntegrations, detectIntegrations } from "../integrations/index.js";
import {
  inputMultiLine,
  selectNetwork,
  selectEnvFiles,
  selectEnvOverrides,
} from "../lib/interactive.js";
import { saveProjectConfig, type ProjectConfig } from "../lib/project-config.js";

export const initCommand = new Command("init")
  .description("Initialize janix in current git repository")
  .action(async () => {
    const cwd = process.cwd();

    if (!isGitRepo(cwd)) {
      console.error("Error: Not a git repository");
      console.error("Run 'git init' first or navigate to a git repository");
      process.exit(1);
    }

    if (!(await pathExists(join(cwd, "flake.nix")))) {
      console.error("Error: No flake.nix found in project root");
      console.error("janix requires a flake.nix to define the dev environment.");
      process.exit(1);
    }

    const projectName = basename(cwd);
    const currentBranch = getCurrentBranch(cwd);
    const varHint = [
      `  \u2713 $JANIX_PROJECT=${projectName}`,
      `  \u2713 $JANIX_BRANCH=${currentBranch}`,
      `  \u2713 $JANIX_BRANCH_SAFE=${encodeBranchForResource(currentBranch)}`,
    ].join("\n");
    const janixDir = join(cwd, JANIX_DIR);

    const configFile = join(janixDir, "config.json");
    if ((await pathExists(janixDir)) && (await pathExists(configFile))) {
      console.log(`janix already initialized in ${projectName}`);
      console.log(`Config at: ${configFile}`);
      return;
    }

    console.log(`\nInitializing janix for ${projectName}...`);

    await mkdir(janixDir, { recursive: true });
    console.log(`\u2713 Created ${JANIX_DIR}/`);

    const clonesDir = join(janixDir, CLONES_DIR);
    await mkdir(clonesDir, { recursive: true });

    console.log("\u2713 Detected flake.nix");

    const detectedPMs = await detectIntegrations(cwd);
    for (const pm of detectedPMs) {
      console.log(`\u2713 Detected ${pm.label}`);
    }

    const selectable = getSelectableIntegrations();
    const selectedIntegrations = await checkbox({
      message: "Select integrations:",
      choices: selectable.map((i) => ({
        name: i.label,
        value: i.id,
        checked: i.defaultSelected,
      })),
    });

    const integrations = [...selectedIntegrations, ...detectedPMs.map((pm) => pm.id)];

    const envFiles = (await readdir(cwd)).filter(
      (f) => f.startsWith(".env") && !f.endsWith(".example") && !f.endsWith(".sample"),
    );

    let selectedEnvFiles: string[] = [];
    let envOverrides: Record<string, string> = {};
    if (envFiles.length > 0) {
      console.log("");
      selectedEnvFiles = await selectEnvFiles(envFiles);

      if (selectedEnvFiles.length > 0) {
        const envVars = await loadEnvFiles(selectedEnvFiles, cwd);
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

    const config: ProjectConfig = {
      integrations,
      envFiles: selectedEnvFiles,
      envOverrides,
      network,
      init: initScripts,
      teardown: teardownScripts,
      consents: {},
    };
    await saveProjectConfig(config);
    console.log(`\n\u2713 Saved ${JANIX_DIR}/config.json`);

    const gitignoreLine = `${JANIX_DIR}/${CLONES_DIR}/`;
    if (await addToGitignore(cwd, gitignoreLine)) {
      console.log(`\u2713 Added ${gitignoreLine} to .gitignore`);
    }

    console.log(`\nReady! Run 'janix create <branch>' to create a dev environment.`);
  });
