import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";

/**
 * Load and merge env files in order (later files override earlier ones).
 */
export function loadEnvFiles(files: string[], projectRoot: string): Record<string, string> {
  let merged: Record<string, string> = {};
  for (const file of files) {
    const filePath = join(projectRoot, file);
    if (!existsSync(filePath)) {
      console.warn(`  Warning: ${file} not found, skipping`);
      continue;
    }
    merged = { ...merged, ...parse(readFileSync(filePath)) };
  }
  return merged;
}
