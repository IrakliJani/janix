import { Command } from "commander";
import * as Config from "../lib/config.js";
import * as Docker from "../lib/docker.js";
import * as Git from "../lib/git.js";
import * as Init from "../lib/init.js";
import * as Interactive from "../lib/interactive.js";
import * as ProjectConfig from "../lib/project-config.js";
import { buildJanixVars, resolveVars } from "../lib/vars.js";

export const destroyCommand = new Command("destroy")
  .alias("rm")
  .description("Destroy a dev environment (removes clone and container)")
  .argument("[clone]", "Clone name or branch (interactive if not provided)")
  .option("-f, --force", "Skip confirmation")
  .option("-y, --yes", "Skip confirmation")
  .action(async (cloneArg: string | undefined, options: { force: boolean; yes: boolean }) => {
    // Verify we're in a janix project
    if (!Config.findJanixRoot()) {
      console.error("Not in a janix project. Run 'janix init' first.");
      process.exit(1);
    }

    Docker.assertDockerRunning();

    const project = Config.getProjectName();
    const clones = Git.listClones();

    // Get clone name
    let cloneName: string;
    if (cloneArg) {
      const match = clones.find((c) => c.name === cloneArg || c.branch === cloneArg);
      if (!match) {
        console.error(`No clone found: '${cloneArg}'`);
        console.error("Run 'janix list' to see available environments");
        process.exit(1);
      }
      cloneName = match.name;
    } else {
      if (clones.length === 0) {
        console.error("No clones found.");
        process.exit(1);
      }
      cloneName = await Interactive.selectClone(clones);
    }

    // Find the clone to get its branch
    const clone = clones.find((c) => c.name === cloneName);
    if (!clone) {
      console.error(`Clone not found: ${cloneName}`);
      process.exit(1);
    }

    if (!options.force && !options.yes) {
      const confirmed = await Interactive.confirm(`Destroy ${cloneName} (clone and container)?`);
      if (!confirmed) {
        console.log("Cancelled");
        return;
      }
    }

    // Run teardown scripts on the host
    const projectConfig = ProjectConfig.loadProjectConfig();
    const projectRoot = Config.getProjectRoot();
    const container = Docker.getContainer(project, clone.branch);
    if (projectConfig.teardown.length > 0) {
      const vars = buildJanixVars(project, clone.branch);
      console.log("Running teardown scripts...");
      try {
        Init.runScriptsOnHost(
          projectConfig.teardown.map((s) => resolveVars(s, vars)),
          projectRoot,
        );
      } catch {
        console.warn("Teardown scripts failed, continuing with destroy...");
      }
    }

    // Remove container if it exists
    if (container) {
      const name = Config.containerName(project, clone.branch);
      console.log(`Removing container ${name}...`);
      Docker.removeContainer(name);
      console.log("Container removed");
    }

    // Remove clone
    console.log(`Removing clone ${cloneName}...`);
    Git.removeClone(clone.branch);
    console.log("Clone removed");

    console.log("Done");
  });
