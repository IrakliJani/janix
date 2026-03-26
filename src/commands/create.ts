import { join } from "node:path";
import { Command } from "commander";
import * as Config from "../lib/config.js";
import * as Docker from "../lib/docker.js";
import * as Env from "../lib/env.js";
import * as Git from "../lib/git.js";
import * as Init from "../lib/init.js";
import * as Interactive from "../lib/interactive.js";
import * as ProjectConfig from "../lib/project-config.js";
import * as Integrations from "../integrations/index.js";
import { section, showFileDiff } from "../lib/ui.js";
import { buildJanixVars, resolveVars } from "../lib/vars.js";

async function promptFlakeRebuild(
  project: string,
  projectRoot: string,
  autoYes: boolean,
): Promise<boolean> {
  const currentHash = await Docker.computeFlakeHash(projectRoot);
  const imageHash = await Docker.getImageFlakeHash(project);
  if (!imageHash || imageHash === currentHash) return false;

  const oldContent = await Docker.getImageFlakeNix(project);
  if (oldContent) {
    console.log("\nflake.nix has changed since the image was built:\n");
    await showFileDiff(oldContent, join(projectRoot, "flake.nix"));
  } else {
    console.log("\nflake.nix has changed since the image was built.");
  }

  if (autoYes) return true;

  return Interactive.confirm("Rebuild Docker image?");
}

async function integrationsChanged(project: string, integrations: string[]): Promise<boolean> {
  const imageIntegrations = await Docker.getImageIntegrations(project);
  if (!imageIntegrations) return false;
  const imageSorted = imageIntegrations.split(",").sort().join(",");
  const currentSorted = [...integrations].sort().join(",");
  return imageSorted !== currentSorted;
}

export const createCommand = new Command("create")
  .alias("c")
  .description("Create a new dev environment for a branch")
  .argument("[branch]", "Branch name (interactive picker if not provided)")
  .option("--no-attach", "Don't attach to container after creation")
  .option("--rebuild", "Force rebuild the Docker image")
  .option("--from <branch>", "Base branch when creating a new branch (default: current branch)")
  .option("-y, --yes", "Skip all confirmation prompts")
  .action(
    async (
      branchArg: string | undefined,
      options: { attach: boolean; rebuild: boolean; from?: string; yes: boolean },
    ) => {
      if (!(await Config.findJanixRoot())) {
        console.error("Not in a janix project. Run 'janix init' first.");
        process.exit(1);
      }

      await Docker.assertDockerRunning();

      const project = await Config.getProjectName();
      const projectRoot = await Config.getProjectRoot();
      const branch = branchArg ?? (await Interactive.selectBranch());

      if (!Git.branchExists(projectRoot, branch)) {
        const base = options.from ?? Git.getCurrentBranch(projectRoot);
        if (options.from && !Git.branchExists(projectRoot, options.from)) {
          console.error(`Base branch '${options.from}' does not exist.`);
          process.exit(1);
        }
        if (!options.yes) {
          const ok = await Interactive.confirm(
            `Branch '${branch}' doesn't exist. Create from '${base}'?`,
          );
          if (!ok) process.exit(0);
        }
        Git.createBranch(projectRoot, branch, base);
      }

      const name = Config.containerName(project, branch);
      const existing = await Docker.getContainer(project, branch);
      if (existing) {
        console.log(`Container for ${project}/${branch} already exists`);
        if (options.attach) {
          if (!(await Docker.isContainerRunning(name))) {
            console.log("Starting stopped container...");
            await Docker.startContainer(name);
          }
          Docker.attachToContainer(name);
        }
        return;
      }

      const projectConfig = await ProjectConfig.loadProjectConfig();
      const { integrations } = projectConfig;
      const vars = buildJanixVars(project, branch);

      let env: Record<string, string> = {};
      if (projectConfig.envFiles.length > 0) {
        env = await Env.loadEnvFiles(projectConfig.envFiles, projectRoot);
      }
      if (Object.keys(projectConfig.envOverrides).length > 0) {
        const resolvedOverrides = Object.fromEntries(
          Object.entries(projectConfig.envOverrides).map(([k, v]) => [k, resolveVars(v, vars)]),
        );
        env = { ...env, ...resolvedOverrides };
      }

      const needsBuild =
        !(await Docker.imageExists(project)) ||
        options.rebuild ||
        (await integrationsChanged(project, integrations)) ||
        (await Docker.dockerfileChanged(project, integrations)) ||
        (await Docker.homeNixChanged(project)) ||
        (await Docker.integrationsNixChanged(project, integrations)) ||
        (await promptFlakeRebuild(project, projectRoot, options.yes));

      if (needsBuild) {
        section("Building image");
        await Docker.buildImage(project, projectRoot, integrations);
      }

      section(`Creating environment: ${project}/${branch}`);
      const clonePath = await Git.createClone(branch);
      console.log(`  Clone:       ${clonePath}`);

      const containerId = await Docker.createContainer({
        project,
        branch,
        clonePath,
        projectRoot,
        network: projectConfig.network,
        integrations,
        env,
      });
      console.log(`  Container:   ${containerId.slice(0, 12)}`);
      if (projectConfig.network) {
        console.log(`  Network:     ${projectConfig.network}`);
      }

      const initScripts = projectConfig.init.map((s) => resolveVars(s, vars));
      if (initScripts.length > 0) {
        section("Running init scripts");
        Init.runScriptsOnHost(initScripts, projectRoot);
      }

      try {
        if (integrations.length > 0) {
          section("Integrations");

          const resolved = Integrations.resolveIntegrations(integrations);
          let configChanged = false;

          const allCreds: {
            integration: Integrations.Integration;
            credential: Integrations.Credential;
            content: string;
          }[] = [];
          for (const integration of resolved) {
            for (const credential of integration.credentials) {
              const content = await credential.resolve();
              if (content !== null) {
                allCreds.push({ integration, credential, content });
              }
            }
          }

          const maxLabelLen = Math.max(0, ...allCreds.map((c) => c.credential.label.length));

          for (const { integration, credential, content } of allCreds) {
            let shouldCopy: boolean;
            if (!credential.requiresConsent || options.yes) {
              shouldCopy = true;
            } else {
              const storedConsent = projectConfig.consents?.[integration.id]?.[credential.label];
              if (storedConsent !== undefined) {
                shouldCopy = storedConsent;
              } else {
                shouldCopy = await Interactive.confirm(`  Copy ${credential.label}?`);
                const integrationConsents = (projectConfig.consents[integration.id] ??= {});
                integrationConsents[credential.label] = shouldCopy;
                configChanged = true;
              }
            }

            const padded = credential.label.padEnd(maxLabelLen);
            if (shouldCopy) {
              await Docker.copyCredentialToContainer(name, content, credential.containerPath);
              console.log(`  ${padded}  \u2713`);
            } else {
              console.log(`  ${padded}  \u2717 (skipped)`);
            }
          }

          if (configChanged) {
            await ProjectConfig.saveProjectConfig(projectConfig);
          }
        }

        const integrationInitCommands = Docker.getIntegrationInitCommands(integrations);
        if (integrationInitCommands.length > 0) {
          section("Setting up environment");
          await Init.runScriptsInDevShell(integrationInitCommands, name);
        }
      } catch (error) {
        const teardownScripts = projectConfig.teardown.map((s) => resolveVars(s, vars));
        if (teardownScripts.length > 0) {
          console.warn("Setup failed, running teardown scripts...");
          try {
            Init.runScriptsOnHost(teardownScripts, projectRoot);
          } catch {
            console.warn("Teardown scripts failed.");
          }
        }
        throw error;
      }

      if (options.attach) {
        section(`Attaching to ${project}/${branch}`);
        Docker.attachToContainer(name);
      } else {
        console.log(`\n  To attach: janix attach ${branch}`);
      }
    },
  );
