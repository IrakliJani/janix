import { containerName, findJanixRoot, getProjectName } from "./config.js";
import { getContainer, type ContainerInfo } from "./docker.js";
import { listClones } from "./git.js";
import { selectClone } from "./interactive.js";

export interface ResolvedClone {
  project: string;
  cloneName: string;
  branch: string;
  clonePath: string;
  containerName: string;
  container: ContainerInfo | undefined;
}

export async function resolveClone(cloneArg: string | undefined): Promise<ResolvedClone> {
  if (!(await findJanixRoot())) {
    console.error("Not in a janix project. Run 'janix init' first.");
    process.exit(1);
  }

  const project = await getProjectName();
  const clones = await listClones();

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
      console.error("No clones found. Run 'janix create <branch>' first.");
      process.exit(1);
    }
    cloneName = await selectClone(clones);
  }

  const clone = clones.find((c) => c.name === cloneName);
  if (!clone) {
    console.error(`Clone not found: ${cloneName}`);
    process.exit(1);
  }

  const container = await getContainer(project, clone.branch);
  const name = containerName(project, clone.branch);

  return {
    project,
    cloneName,
    branch: clone.branch,
    clonePath: clone.path,
    containerName: name,
    container,
  };
}
