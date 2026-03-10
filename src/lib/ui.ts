import { spawnSync } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function separator(): string {
  const cols = process.stdout.columns || 80;
  return "\u2500".repeat(cols);
}

export function section(title: string): void {
  const sep = separator();
  console.log(`\n${sep}`);
  console.log(`  ${title}`);
  console.log(sep);
}

export async function showFileDiff(oldContent: string, newPath: string): Promise<void> {
  const oldTmp = join(tmpdir(), `janix-diff-old-${Date.now()}`);
  try {
    await writeFile(oldTmp, oldContent);
    spawnSync("git", ["diff", "--no-index", "--color=always", oldTmp, newPath], {
      stdio: "inherit",
    });
  } finally {
    try {
      await unlink(oldTmp);
    } catch {
      /* ignore */
    }
  }
}
