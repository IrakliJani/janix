import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "dotenv";
import { pathExists } from "./fs.js";

export async function loadEnvFiles(
  files: string[],
  projectRoot: string,
): Promise<Record<string, string>> {
  let merged: Record<string, string> = {};
  for (const file of files) {
    const filePath = join(projectRoot, file);
    if (!(await pathExists(filePath))) {
      console.warn(`  Warning: ${file} not found, skipping`);
      continue;
    }
    merged = { ...merged, ...parse(await readFile(filePath)) };
  }
  return merged;
}
