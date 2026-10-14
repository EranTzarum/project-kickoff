// node --test scripts/line-endings.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync, readFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const run = (script, ...args) => spawnSync(process.execPath, [join(here, script), ...args], { encoding: "utf8" });

function freshProject() {
  const dir = mkdtempSync(join(tmpdir(), "kickoff-le-"));
  const r = run("render.mjs", dir, join(here, "../templates/answers.example.json"));
  assert.equal(r.status, 0, r.stderr);
  return dir;
}

const matrixPath = (dir) => join(dir, "docs/ENV_MATRIX.md");
const matrix = (dir) => readFileSync(matrixPath(dir), "utf8").replace(/\r\n/g, "\n");

test("full render passes strict with no env-tiers or line-endings CHECK lines", () => {
  const dir = freshProject();
  const r = run("preflight.mjs", dir, "--strict");
  assert.equal(r.status, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /CHECK env-tiers:/);
  assert.doesNotMatch(r.stdout, /CHECK line-endings:/);
  rmSync(dir, { recursive: true, force: true });
});

test("shared real-user database with a disposable tier is reported", () => {
  const dir = freshProject();
  const prodDb = "abcdefghijklmnopqrst";
  let m = matrix(dir);
  m = m.replace(/^\| Preview \|[^|]*\|[^|]*\| [^|]* \|/m, (row) => row.replace(/\| tttttttttttttttttttt \|/, `| ${prodDb} |`));
  m = m.replace(/^\| Test \|[^|]*\|[^|]*\| tttttttttttttttttttt \|/m, `| Test | - | - | ${prodDb} |`);
  writeFileSync(matrixPath(dir), m);
  const advisory = run("preflight.mjs", dir);
  assert.equal(advisory.status, 0);
  assert.match(
    advisory.stdout,
    /CHECK env-tiers: database abcdefghijklmnopqrst holds real users \(Prod\) and is shared with disposable tier Test/,
  );
  assert.equal(run("preflight.mjs", dir, "--strict").status, 1);
  rmSync(dir, { recursive: true, force: true });
});

test("tier marked both real users and disposable", () => {
  const dir = freshProject();
  let m = matrix(dir);
  m = m.replace(/^\| Test \|(.*\|) no \| yes \|$/m, "| Test |$1 yes | yes |");
  writeFileSync(matrixPath(dir), m);
  const r = run("preflight.mjs", dir);
  assert.match(r.stdout, /CHECK env-tiers: tier Test is marked both real users and disposable/);
  rmSync(dir, { recursive: true, force: true });
});

test("CRLF in a shell script is reported", () => {
  const dir = freshProject();
  writeFileSync(join(dir, "scripts/deploy.sh"), "#!/bin/bash\r\nset -euo pipefail\r\n");
  const r = run("preflight.mjs", dir);
  assert.match(r.stdout, /CHECK line-endings: scripts\/deploy\.sh has CRLF line endings; it fails on Linux/);
  rmSync(dir, { recursive: true, force: true });
});

test(".gitattributes must pin *.sh eol=lf when shell scripts exist", () => {
  const dir = freshProject();
  unlinkSync(join(dir, ".gitattributes"));
  let r = run("preflight.mjs", dir);
  assert.match(r.stdout, /CHECK line-endings: \.gitattributes has no "\*\.sh text eol=lf" rule/);
  writeFileSync(join(dir, ".gitattributes"), "*.sh text eol=lf\r\n");
  r = run("preflight.mjs", dir);
  assert.doesNotMatch(r.stdout, /CHECK line-endings: \.gitattributes has no/);
  rmSync(dir, { recursive: true, force: true });
});

test("adopt-mapped environments file is checked for env-tiers", () => {
  const dir = freshProject();
  mkdirSync(join(dir, ".kickoff"), { recursive: true });
  const prodDb = "abcdefghijklmnopqrst";
  const envDoc = `# Environments

## Environment tiers

| Tier | Web host | Branch | Database | API origin | Auth redirects | Real users | Disposable |
|---|---|---|---|---|---|---|---|
| Prod | https://app.example.com | main | ${prodDb} | - | - | yes | no |
| Sandbox | - | - | ${prodDb} | - | - | no | yes |
`;
  writeFileSync(join(dir, "docs/environments.md"), envDoc);
  writeFileSync(
    join(dir, ".kickoff/adopt.json"),
    JSON.stringify({ mapped: { "docs/ENV_MATRIX.md": "docs/environments.md" } }),
  );
  const r = run("preflight.mjs", dir);
  assert.match(
    r.stdout,
    /CHECK env-tiers: database abcdefghijklmnopqrst holds real users \(Prod\) and is shared with disposable tier Sandbox/,
  );
  rmSync(dir, { recursive: true, force: true });
});

test("a CRLF shell script deep in the tree is still found, by preflight and by adopt", () => {
  const dir = mkdtempSync(join(tmpdir(), "le-deep-"));
  const deep = "apps/web/scripts/deploy/linux/release/deploy.sh";
  mkdirSync(join(dir, dirname(deep)), { recursive: true });
  writeFileSync(join(dir, deep), "#!/usr/bin/env bash\r\nset -euo pipefail\r\n");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "demo-app" }));
  const adopt = spawnSync(process.execPath, [join(here, "adopt.mjs"), dir, "--write"], { encoding: "utf8" });
  assert.match(adopt.stdout, new RegExp(`GAP high: ${deep.replace(/[./]/g, "\\$&")} has CRLF`));
  const r = spawnSync(process.execPath, [join(here, "preflight.mjs"), dir], { encoding: "utf8" });
  assert.match(r.stdout, new RegExp(`CHECK line-endings: ${deep.replace(/[./]/g, "\\$&")} has CRLF`));
  rmSync(dir, { recursive: true, force: true });
});

test("the *.sh eol=lf rule must be on one line of .gitattributes", () => {
  const dir = freshProject();
  writeFileSync(join(dir, ".gitattributes"), "*.sh\n*.yml text eol=lf\n");
  assert.match(run("preflight.mjs", dir).stdout, /CHECK line-endings: \.gitattributes has no "\*\.sh text eol=lf" rule/);
  writeFileSync(join(dir, ".gitattributes"), "*.sh text eol=lf\n");
  assert.doesNotMatch(run("preflight.mjs", dir).stdout, /CHECK line-endings/);
  rmSync(dir, { recursive: true, force: true });
});

test("a symlinked shell script is checked through its target", (t) => {
  const dir = freshProject();
  mkdirSync(join(dir, "tools"));
  writeFileSync(join(dir, "tools/deploy-script"), "#!/usr/bin/env bash\r\necho ok\r\n");
  try { symlinkSync(join(dir, "tools/deploy-script"), join(dir, "scripts/deploy.sh"), "file"); }
  catch { rmSync(dir, { recursive: true, force: true }); return t.skip("symlinks not permitted here"); }
  assert.match(run("preflight.mjs", dir).stdout, /CHECK line-endings: scripts\/deploy\.sh has CRLF/);
  rmSync(dir, { recursive: true, force: true });
});

test("the effective *.sh rule is the last one, and -text disables it", () => {
  const dir = freshProject();
  const missing = /CHECK line-endings: \.gitattributes has no "\*\.sh text eol=lf" rule/;
  for (const ga of ["*.sh text eol=lf\n*.sh text eol=crlf\n", "*.sh -text eol=lf\n"]) {
    writeFileSync(join(dir, ".gitattributes"), ga);
    assert.match(run("preflight.mjs", dir).stdout, missing, JSON.stringify(ga));
  }
  writeFileSync(join(dir, ".gitattributes"), "*.sh text eol=crlf\n*.sh text eol=lf\n");
  assert.doesNotMatch(run("preflight.mjs", dir).stdout, missing);
  rmSync(dir, { recursive: true, force: true });
});

test("tier rows without outer pipes still report a shared real-user database", () => {
  const dir = freshProject();
  const m = readFileSync(matrixPath(dir), "utf8").replace(/\r\n/g, "\n");
  const head = m.slice(0, m.indexOf("## Environment tiers"));
  writeFileSync(matrixPath(dir), head + [
    "## Environment tiers",
    "Tier | Web host | Branch | Database | API origin | Auth redirects | Real users | Disposable",
    "---|---|---|---|---|---|---|---",
    "Prod | https://app.example.com | main | shared-db | - | - | yes | no",
    "Test | - | - | shared-db | - | - | no | yes",
    "",
  ].join("\n"));
  assert.match(run("preflight.mjs", dir).stdout, /CHECK env-tiers: database shared-db holds real users \(Prod\) and is shared with disposable tier Test/);
  rmSync(dir, { recursive: true, force: true });
});
