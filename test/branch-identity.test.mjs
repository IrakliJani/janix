import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  containerName,
  decodeBranchFromResource,
  encodeBranchForResource,
} from "../dist/lib/config.js";
import { listClones } from "../dist/lib/git.js";
import { buildJanixVars } from "../dist/lib/vars.js";

test("branch resource key roundtrips", () => {
  const branches = [
    "feat/foo-bar-baz-2",
    "feat-foo",
    "MAIN",
    "fix/unicode-geo-გ",
    "hotfix/@prod#1",
    "release/v1.2.3",
    "feature/emoji-😀",
    "feature/mix-Äß-東京",
    "x",
    "dash--dash",
    "trailing.",
    "_leading-underscore",
    "double//slash",
  ];

  for (const branch of branches) {
    const key = encodeBranchForResource(branch);
    const decoded = decodeBranchFromResource(key);
    assert.equal(decoded, branch);
  }
});

test("encoded resource key uses only lowercase/digits/hyphen", () => {
  const branches = [
    "feat/foo",
    "MAIN",
    "feature/emoji-😀",
    "feature/mix-Äß-東京",
    "hotfix/@prod#1",
  ];

  for (const branch of branches) {
    const key = encodeBranchForResource(branch);
    assert.match(key, /^[a-z0-9-]+$/);
  }
});

test("decode rejects malformed resource keys", () => {
  const malformed = [
    "",
    "-",
    "abc-",
    "abc-1",
    "abc-zz",
    "abc-z1",
    "abc---",
    "abc-2",
    "abc-2x",
  ];

  for (const key of malformed) {
    assert.throws(() => decodeBranchFromResource(key), /Invalid resource branch key/);
  }
});

test("slash and hyphen variants stay distinct", () => {
  const variants = [
    "a/b",
    "a-b",
    "a--b",
    "a///b",
    "a-/-b",
    "a/-/b",
  ];

  const keys = variants.map((branch) => encodeBranchForResource(branch));
  assert.equal(new Set(keys).size, variants.length);
});

test("resource key avoids slash-hyphen collisions", () => {
  const slash = "feat/foo";
  const hyphen = "feat-foo";

  assert.notEqual(encodeBranchForResource(slash), encodeBranchForResource(hyphen));
  assert.notEqual(containerName("proj", slash), containerName("proj", hyphen));
});

test("buildJanixVars exposes JANIX_BRANCH_SAFE", () => {
  const branch = "feat/foo-bar-baz-2";
  const vars = buildJanixVars("proj", branch);

  assert.equal(vars.JANIX_BRANCH, branch);
  assert.equal(vars.JANIX_BRANCH_SAFE, encodeBranchForResource(branch));
});

test("listClones keeps canonical branch identity when HEAD drifts", async () => {
  const prevCwd = process.cwd();
  const root = await mkdtemp(join(tmpdir(), "janix-identity-test-"));

  try {
    const clonesDir = join(root, ".janix", "clones");
    await mkdir(clonesDir, { recursive: true });

    const canonicalBranch = "feat/foo";
    const cloneName = encodeBranchForResource(canonicalBranch);
    const clonePath = join(clonesDir, cloneName);
    await mkdir(clonePath, { recursive: true });

    execFileSync("git", ["init", "-q"], { cwd: clonePath });
    execFileSync("git", ["config", "user.name", "janix-test"], { cwd: clonePath });
    execFileSync("git", ["config", "user.email", "janix-test@example.com"], { cwd: clonePath });
    await writeFile(join(clonePath, "README.md"), "test\n");
    execFileSync("git", ["add", "."], { cwd: clonePath });
    execFileSync("git", ["commit", "-m", "init", "-q"], { cwd: clonePath });
    execFileSync("git", ["checkout", "-b", "drift-branch", "-q"], { cwd: clonePath });

    process.chdir(root);

    const clones = await listClones();
    assert.equal(clones.length, 1);

    const [clone] = clones;
    assert.ok(clone);
    assert.equal(clone.name, cloneName);
    assert.equal(clone.branch, canonicalBranch);
    assert.equal(clone.currentBranch, "drift-branch");
  } finally {
    process.chdir(prevCwd);
    await rm(root, { recursive: true, force: true });
  }
});
