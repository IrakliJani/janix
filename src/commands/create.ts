import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { Command } from "commander";
import * as Config from "../lib/config.js";
import * as Docker from "../lib/docker.js";
import * as Integrations from "../integrations/index.js";
import * as Git from "../lib/git.js";
import * as Init from "../lib/init.js";
import * as Interactive from "../lib/interactive.js";
import * as ProjectConfig from "../lib/project-config.js";
import * as Env from "../lib/env.js";

async function promptFlakeRebuild(
  project: string,
  projectRoot: string,
  autoYes: boolean,
): Promise<boolean> {
  const currentHash = Docker.computeFlakeHash(projectRoot);
  const imageHash = Docker.getImageFlakeHash(project);
  if (!imageHash || imageHash === currentHash) return false;

  // TODO: this is wrong, it does not mean the image should rebuild (only if something changed then it needs to rebuild)
  if (autoYes) return true;

  const oldContent = Docker.getImageFlakeNix(project);
  if (oldContent) {
    const oldTmp = join(tmpdir(), `janix-flake-old-${Date.now()}.nix`);
    try {
      writeFileSync(oldTmp, oldContent);
      console.log("\nflake.nix has changed since the image was built:\n");
      // TODO: maybe put this in diff lib ?
      spawnSync(
        "git",
        ["diff", "--no-index", "--color=always", oldTmp, join(projectRoot, "flake.nix")],
        {
          stdio: "inherit",
        },
      );
    } finally {
      try {
        unlinkSync(oldTmp);
      } catch {
        /* ignore */
      }
    }
  } else {
    console.log("\nflake.nix has changed since the image was built.");
  }

  // TODO: we can use auto yes here instead.
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

      // TODO: this should print a helpful error
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

      // Built-in template vars available in override values
      const janixVars: Record<string, string> = {
        JANIX_BRANCH: branch,
        JANIX_PROJECT: project,
        JANIX_BRANCH_SLUG: Config.sanitizeBranchForId(branch),
        JANIX_BRANCH_SAFE: Config.sanitizeBranchSafe(branch),
      };

      const resolveTemplateVars = (value: string): string =>
        value.replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g, (_, name) => janixVars[name] ?? `$${name}`);

      // Load env files and apply stored overrides (with template var resolution)
      let env: Record<string, string> = {};
      if (projectConfig.envFiles.length > 0) {
        env = Env.loadEnvFiles(projectConfig.envFiles, projectRoot);
      }
      if (Object.keys(projectConfig.envOverrides).length > 0) {
        const resolvedOverrides = Object.fromEntries(
          Object.entries(projectConfig.envOverrides).map(([k, v]) => [k, resolveTemplateVars(v)]),
        );
        env = { ...env, ...resolvedOverrides };
      }

      // TODO: can be size of a terminal window (add a helper utility for this)"
      const sep = "────────────────────────────────────";

      // Ensure Docker image exists (or rebuild if requested / integrations changed)
      const needsBuild =
        !Docker.imageExists(project) ||
        options.rebuild ||
        integrationsChanged(project, integrations) ||
        (await promptFlakeRebuild(project, projectRoot, options.yes));
      // TODO: also... this should check if dockerfile changed

      if (needsBuild) {
        console.log(`\n${sep}`);
        console.log(`  Building image`);
        console.log(sep);
        Docker.buildImage(project, projectRoot, integrations);
      }

      // Create clone
      console.log(`\n${sep}`);
      console.log(`  Creating environment: ${project}/${branch}`);
      console.log(sep);
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

      // TODO: this tree is shit, needs refactor, I would like this to be flat and prettier. thanks.
      // Resolve credentials and copy, displaying as a tree per integration
      if (integrations.length > 0) {
        console.log(`\n${sep}`);
        console.log(`  Integrations`);
        console.log(sep);

        const resolved = Integrations.resolveIntegrations(integrations);
        const lastIdx = resolved.length - 1;
        for (const [i, integration] of resolved.entries()) {
          const isLast = i === lastIdx;
          const prefix = isLast ? "  └─ " : "  ├─ ";
          const childPrefix = isLast ? "     " : "  │  ";

          const creds = integration.credentials
            .map((c) => ({ credential: c, content: c.resolve() }))
            .filter(
              (c): c is { credential: Integrations.Credential; content: string } =>
                c.content !== null,
            );

          console.log(`${prefix}${integration.label}`);

          const lastCredIdx = creds.length - 1;
          for (const [j, { credential, content }] of creds.entries()) {
            const credBranch = j === lastCredIdx ? "└─ " : "├─ ";

            // TODO: if you consent about copying user credentials once, you should be good the next time so I assume that can be added to the janix config later on when you say yes to pi integration it will save that you said yes to pi integration credential copy and same goes with settings as well
            const shouldCopy =
              options.yes ||
              (await Interactive.confirm(`${childPrefix}  Copy ${credential.label}?`));
            if (shouldCopy) {
              Docker.copyCredentialToContainer(name, content, credential.containerPath);
              console.log(`${childPrefix}${credBranch}\u2713 ${credential.label}`);
            } else {
              console.log(`${childPrefix}${credBranch}\u2717 ${credential.label} (skipped)`);
            }
          }
        }
      }

      // TODO: shouldn't this run after the host script run? or maybe even before the container start kicks off? maybe user does something that requires this script to run first. oh and if init script succeeds and anything else fails (like container starting for example) then it should call the teardown script
      // Run integration init commands inside the container
      const integrationInitCommands = Docker.getIntegrationInitCommands(integrations);
      if (integrationInitCommands.length > 0) {
        await Init.runScriptsInDevShell(integrationInitCommands, name);
      }

      // Run user init scripts on the host
      const initScripts = projectConfig.init.map(resolveTemplateVars);
      if (initScripts.length > 0) {
        console.log(`\n${sep}`);
        console.log(`  Running init scripts`);
        console.log(sep);
        Init.runScriptsOnHost(initScripts, projectRoot);
      }

      // Attach
      if (options.attach) {
        console.log(`\n${sep}`);
        console.log(`  Attaching to ${project}/${branch}`);
        console.log(sep);
        Docker.attachToContainer(name);
      } else {
        console.log(`\n  To attach: janix attach ${branch}`);
      }
    },
  );
