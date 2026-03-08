import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

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

export function showFileDiff(oldContent: string, newPath: string): void {
  const oldTmp = join(tmpdir(), `janix-diff-old-${Date.now()}`);
  try {
    writeFileSync(oldTmp, oldContent);
    spawnSync("git", ["diff", "--no-index", "--color=always", oldTmp, newPath], {
      stdio: "inherit",
    });
  } finally {
    try {
      unlinkSync(oldTmp);
    } catch {
      /* ignore */
    }
  }
}
