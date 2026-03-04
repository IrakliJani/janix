import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { Command } from "commander";
import {
  containerName,
  findJanixRoot,
  getProjectName,
  getProjectRoot,
  sanitizeBranchForId,
  sanitizeBranchSafe,
} from "../lib/config.js";
import {
  getContainer,
  createContainer,
  attachToContainer,
  imageExists,
  buildImage,
  isContainerRunning,
  startContainer,
  getIntegrationInitCommands,
  copyCredentialToContainer,
  assertDockerRunning,
  computeFlakeHash,
  getImageFlakeHash,
  getImageFlakeNix,
  getImageIntegrations,
} from "../lib/docker.js";
import { resolveIntegrations, type Credential } from "../integrations/index.js";
import { branchExists, createBranch, createClone } from "../lib/git.js";
import { runScriptsInDevShell, getCurrentBranch } from "../lib/init.js";
import { selectBranch, confirm } from "../lib/interactive.js";
import { loadProjectConfig } from "../lib/project-config.js";
import { loadEnvFiles } from "../lib/env.js";

async function promptFlakeRebuild(
  project: string,
  projectRoot: string,
  autoYes: boolean,
): Promise<boolean> {
  const currentHash = computeFlakeHash(projectRoot);
  const imageHash = getImageFlakeHash(project);
  if (!imageHash || imageHash === currentHash) return false;

  if (autoYes) return true;

  const oldContent = getImageFlakeNix(project);
  if (oldContent) {
    const oldTmp = join(tmpdir(), `janix-flake-old-${Date.now()}.nix`);
    try {
      writeFileSync(oldTmp, oldContent);
      console.log("\nflake.nix has changed since the image was built:\n");
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

  return confirm("Rebuild Docker image?");
}

function integrationsChanged(project: string, integrations: string[]): boolean {
  const imageIntegrations = getImageIntegrations(project);
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
      if (!findJanixRoot()) {
        console.error("Not in a janix project. Run 'janix init' first.");
        process.exit(1);
      }

      assertDockerRunning();

      const project = getProjectName();
      const projectRoot = getProjectRoot();

      // Get branch (interactive or from argument)
      const branch = branchArg ?? (await selectBranch());

      // Create branch if it doesn't exist
      if (!branchExists(projectRoot, branch)) {
        const base = getCurrentBranch(projectRoot);
        if (!options.yes) {
          const ok = await confirm(`Branch '${branch}' doesn't exist. Create from '${base}'?`);
          if (!ok) process.exit(0);
        }
        createBranch(projectRoot, branch, base);
      }

      const name = containerName(project, branch);

      // Check if container already exists for this branch
      const existing = getContainer(project, branch);
      if (existing) {
        console.log(`Container for ${project}/${branch} already exists`);
        if (options.attach) {
          if (!isContainerRunning(name)) {
            console.log("Starting stopped container...");
            startContainer(name);
          }
          attachToContainer(name);
        }
        return;
      }

      // Load project config
      const projectConfig = loadProjectConfig();
      const { integrations } = projectConfig;

      // Built-in template vars available in override values
      const janixVars: Record<string, string> = {
        JANIX_BRANCH: branch,
        JANIX_PROJECT: project,
        JANIX_BRANCH_SLUG: sanitizeBranchForId(branch),
        JANIX_BRANCH_SAFE: sanitizeBranchSafe(branch),
      };

      const resolveTemplateVars = (value: string): string =>
        value.replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g, (_, name) => janixVars[name] ?? `$${name}`);

      // Load env files and apply stored overrides (with template var resolution)
      let env: Record<string, string> = {};
      if (projectConfig.envFiles.length > 0) {
        env = loadEnvFiles(projectConfig.envFiles, projectRoot);
      }
      if (Object.keys(projectConfig.envOverrides).length > 0) {
        const resolvedOverrides = Object.fromEntries(
          Object.entries(projectConfig.envOverrides).map(([k, v]) => [k, resolveTemplateVars(v)]),
        );
        env = { ...env, ...resolvedOverrides };
      }

      const sep = "────────────────────────────────────";

      // Ensure Docker image exists (or rebuild if requested / integrations changed)
      const needsBuild =
        !imageExists(project) ||
        options.rebuild ||
        integrationsChanged(project, integrations) ||
        (await promptFlakeRebuild(project, projectRoot, options.yes));
      if (needsBuild) {
        console.log(`\n${sep}`);
        console.log(`  Building image`);
        console.log(sep);
        buildImage(project, projectRoot, integrations);
      }

      // Create clone
      console.log(`\n${sep}`);
      console.log(`  Creating environment: ${project}/${branch}`);
      console.log(sep);
      const clonePath = createClone(branch);
      console.log(`  Clone:       ${clonePath}`);

      // Create container
      const containerId = createContainer({
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

      // Resolve credentials and copy, displaying as a tree per integration
      if (integrations.length > 0) {
        console.log(`\n${sep}`);
        console.log(`  Integrations`);
        console.log(sep);

        const resolved = resolveIntegrations(integrations);
        const lastIdx = resolved.length - 1;
        for (const [i, integration] of resolved.entries()) {
          const isLast = i === lastIdx;
          const prefix = isLast ? "  └─ " : "  ├─ ";
          const childPrefix = isLast ? "     " : "  │  ";

          const creds = integration.credentials
            .map((c) => ({ credential: c, content: c.resolve() }))
            .filter((c): c is { credential: Credential; content: string } => c.content !== null);

          console.log(`${prefix}${integration.label}`);

          const lastCredIdx = creds.length - 1;
          for (const [j, { credential, content }] of creds.entries()) {
            const credBranch = j === lastCredIdx ? "└─ " : "├─ ";

            const shouldCopy =
              options.yes || (await confirm(`${childPrefix}  Copy ${credential.label}?`));
            if (shouldCopy) {
              copyCredentialToContainer(name, content, credential.containerPath);
              console.log(`${childPrefix}${credBranch}\u2713 ${credential.label}`);
            } else {
              console.log(`${childPrefix}${credBranch}\u2717 ${credential.label} (skipped)`);
            }
          }
        }
      }

      // Run all init scripts in a single dev shell invocation
      const allInitScripts = [...getIntegrationInitCommands(integrations), ...projectConfig.init];
      if (allInitScripts.length > 0) {
        console.log(`\n${sep}`);
        console.log(`  Running init scripts`);
        console.log(sep);
        await runScriptsInDevShell(allInitScripts, name, janixVars);
      }

      // Attach
      if (options.attach) {
        console.log(`\n${sep}`);
        console.log(`  Attaching to ${project}/${branch}`);
        console.log(sep);
        attachToContainer(name);
      } else {
        console.log(`\n  To attach: janix attach ${branch}`);
      }
    },
  );
