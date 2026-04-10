import { Command } from "commander";
import * as Config from "../lib/config.js";
import * as Docker from "../lib/docker.js";
import * as Git from "../lib/git.js";
import * as Init from "../lib/init.js";
import * as Interactive from "../lib/interactive.js";
import * as ProjectConfig from "../lib/project-config.js";
import { resolveClone } from "../lib/resolve-clone.js";
import { buildJanixVars, resolveVars } from "../lib/vars.js";

export const rmCommand = new Command("rm")
  .description("Remove a dev environment (removes clone and container)")
  .argument("[clone]", "Clone name or branch (interactive if not provided)")
  .option("-y, --yes", "Skip confirmation")
  .action(async (cloneArg: string | undefined, options: { yes: boolean }) => {
    await Docker.assertDockerRunning();

    const { project, cloneName, branch, containerName, container } = await resolveClone(cloneArg);

    if (!options.yes) {
      const confirmed = await Interactive.confirm(`Remove ${cloneName} (clone and container)?`);
      if (!confirmed) {
        console.log("Cancelled");
        return;
      }
    }

    const projectConfig = await ProjectConfig.loadProjectConfig();
    const projectRoot = await Config.getProjectRoot();
    if (projectConfig.teardown.length > 0) {
      const vars = buildJanixVars(project, branch);
      console.log("Running teardown scripts...");
      try {
        Init.runScriptsOnHost(
          projectConfig.teardown.map((s) => resolveVars(s, vars)),
          projectRoot,
        );
      } catch {
        console.warn("Teardown scripts failed, continuing with removal...");
      }
    }

    if (container) {
      console.log(`Removing container ${containerName}...`);
      await Docker.removeContainer(containerName);
      console.log("Container removed");
    }

    console.log(`Removing clone ${cloneName}...`);
    await Git.removeClone(branch);
    console.log("Clone removed");

    console.log("Done");
  });
