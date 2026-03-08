import { join } from "node:path";
import { Command } from "commander";
import * as Config from "../lib/config.js";
import * as Docker from "../lib/docker.js";
import * as Integrations from "../integrations/index.js";
import * as Git from "../lib/git.js";
import * as Init from "../lib/init.js";
import * as Interactive from "../lib/interactive.js";
import * as ProjectConfig from "../lib/project-config.js";
import * as Env from "../lib/env.js";
import { buildJanixVars, resolveVars } from "../lib/vars.js";
import { section, showFileDiff } from "../lib/ui.js";

async function promptFlakeRebuild(
  project: string,
  projectRoot: string,
  autoYes: boolean,
): Promise<boolean> {
  const currentHash = Docker.computeFlakeHash(projectRoot);
  const imageHash = Docker.getImageFlakeHash(project);
  if (!imageHash || imageHash === currentHash) return false;

  const oldContent = Docker.getImageFlakeNix(project);
  if (oldContent) {
    console.log("\nflake.nix has changed since the image was built:\n");
    showFileDiff(oldContent, join(projectRoot, "flake.nix"));
  } else {
    console.log("\nflake.nix has changed since the image was built.");
  }

  if (autoYes) return true;

  return Interactive.confirm("Rebuild Docker image?");
}

function integrationsChanged(project: string, integrations: string[]): boolean {
  const imageIntegrations = Docker.getImageIntegrations(project);
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
  .option("-y, --yes", "Skip all confirmation prompts")
  .action(
    async (
      branchArg: string | undefined,
      options: { attach: boolean; rebuild: boolean; yes: boolean },
    ) => {
      // Verify we're in a janix project
      if (!Config.findJanixRoot()) {
        console.error("Not in a janix project. Run 'janix init' first.");
        process.exit(1);
      }

      Docker.assertDockerRunning();

      const project = Config.getProjectName();
      const projectRoot = Config.getProjectRoot();

      // Get branch (interactive or from argument)
      const branch = branchArg ?? (await Interactive.selectBranch());

      // Create branch if it doesn't exist
      if (!Git.branchExists(projectRoot, branch)) {
        const base = Init.getCurrentBranch(projectRoot);
        if (!options.yes) {
          const ok = await Interactive.confirm(
            `Branch '${branch}' doesn't exist. Create from '${base}'?`,
          );
          if (!ok) process.exit(0);
        }
        Git.createBranch(projectRoot, branch, base);
      }

      const name = Config.containerName(project, branch);

      // Check if container already exists for this branch
      const existing = Docker.getContainer(project, branch);
      if (existing) {
        console.log(`Container for ${project}/${branch} already exists`);
        if (options.attach) {
          if (!Docker.isContainerRunning(name)) {
            console.log("Starting stopped container...");
            Docker.startContainer(name);
          }
          Docker.attachToContainer(name);
        }
        return;
      }

      // Load project config
      const projectConfig = ProjectConfig.loadProjectConfig();
      const { integrations } = projectConfig;

      // Build template vars for env resolution
      const vars = buildJanixVars(project, branch);

      // Load env files and apply stored overrides (with template var resolution)
      let env: Record<string, string> = {};
      if (projectConfig.envFiles.length > 0) {
        env = Env.loadEnvFiles(projectConfig.envFiles, projectRoot);
      }
      if (Object.keys(projectConfig.envOverrides).length > 0) {
        const resolvedOverrides = Object.fromEntries(
          Object.entries(projectConfig.envOverrides).map(([k, v]) => [k, resolveVars(v, vars)]),
        );
        env = { ...env, ...resolvedOverrides };
      }

      // Ensure Docker image exists (or rebuild if requested / integrations changed)
      const needsBuild =
        !Docker.imageExists(project) ||
        options.rebuild ||
        integrationsChanged(project, integrations) ||
        Docker.dockerfileChanged(project, integrations) ||
        (await promptFlakeRebuild(project, projectRoot, options.yes));

      if (needsBuild) {
        section("Building image");
        Docker.buildImage(project, projectRoot, integrations);
      }

      // Create clone
      section(`Creating environment: ${project}/${branch}`);
      const clonePath = Git.createClone(branch);
      console.log(`  Clone:       ${clonePath}`);

      // Create container
      const containerId = Docker.createContainer({
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

      // Run user init scripts on the host (before integration init)
      const initScripts = projectConfig.init.map((s) => resolveVars(s, vars));
      if (initScripts.length > 0) {
        section("Running init scripts");
        Init.runScriptsOnHost(initScripts, projectRoot);
      }

      // From here, wrap in try/catch so teardown runs on failure
      try {
        // Resolve credentials and copy, displaying as a flat list
        if (integrations.length > 0) {
          section("Integrations");

          const resolved = Integrations.resolveIntegrations(integrations);
          let configChanged = false;

          // Collect all resolvable credentials for padding calculation
          const allCreds: {
            integration: Integrations.Integration;
            credential: Integrations.Credential;
            content: string;
          }[] = [];
          for (const integration of resolved) {
            for (const credential of integration.credentials) {
              const content = credential.resolve();
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
              // Check stored consent
              const storedConsent = projectConfig.consents?.[integration.id]?.[credential.label];
              if (storedConsent !== undefined) {
                shouldCopy = storedConsent;
              } else {
                shouldCopy = await Interactive.confirm(`  Copy ${credential.label}?`);
                // Persist consent
                const integrationConsents = (projectConfig.consents[integration.id] ??= {});
                integrationConsents[credential.label] = shouldCopy;
                configChanged = true;
              }
            }

            const padded = credential.label.padEnd(maxLabelLen);
            if (shouldCopy) {
              Docker.copyCredentialToContainer(name, content, credential.containerPath);
              console.log(`  ${padded}  \u2713`);
            } else {
              console.log(`  ${padded}  \u2717 (skipped)`);
            }
          }

          if (configChanged) {
            ProjectConfig.saveProjectConfig(projectConfig);
          }
        }

        // Run integration init commands inside the container
        const integrationInitCommands = Docker.getIntegrationInitCommands(integrations);
        if (integrationInitCommands.length > 0) {
          section("Setting up environment");
          await Init.runScriptsInDevShell(integrationInitCommands, name);
        }
      } catch (error) {
        // Run teardown scripts on failure
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

      // Attach
      if (options.attach) {
        section(`Attaching to ${project}/${branch}`);
        Docker.attachToContainer(name);
      } else {
        console.log(`\n  To attach: janix attach ${branch}`);
      }
    },
  );
