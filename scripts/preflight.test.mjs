// node --test scripts/preflight.test.mjs
// Renders the templates from answers.example.json into a temp dir, then proves the checker:
// all READY after a full render; MISSING + strict exit 1 after deleting a deliverable;
// a placeholder left behind is reported; env drift and a migration without RLS are caught.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const run = (script, ...args) => spawnSync(process.execPath, [join(here, script), ...args], { encoding: "utf8" });

function freshProject() {
  const dir = mkdtempSync(join(tmpdir(), "kickoff-"));
  const r = run("render.mjs", dir, join(here, "../templates/answers.example.json"));
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /unfilled/, "example answers must fill every placeholder");
  return dir;
}

test("full render → every stage READY, strict exits 0", () => {
  const dir = freshProject();
  const r = run("preflight.mjs", dir, "--strict");
  assert.equal(r.status, 0, r.stdout);
  for (const n of [0, 1, 2, 3, 4, 5]) assert.match(r.stdout, new RegExp(`^STAGE ${n} .*: READY$`, "m"));
  assert.doesNotMatch(r.stdout, /^CHECK /m);
  rmSync(dir, { recursive: true, force: true });
});

test("deleted deliverable → MISSING, strict exits 1, advisory exits 0", () => {
  const dir = freshProject();
  unlinkSync(join(dir, "docs/DOMAIN.md"));
  const strict = run("preflight.mjs", dir, "--strict");
  assert.equal(strict.status, 1);
  assert.match(strict.stdout, /^STAGE 1 DOMAIN: MISSING — docs\/DOMAIN.md \(absent\)/m);
  assert.equal(run("preflight.mjs", dir).status, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("leftover placeholder, env drift and a table without RLS are reported", () => {
  const dir = freshProject();
  appendFileSync(join(dir, "docs/ARCHITECTURE.md"), "\n{{LATER}}\n");
  appendFileSync(join(dir, ".env.example"), "\nEXTRA_KEY=\n");
  writeFileSync(join(dir, "supabase/migrations/202601010000_bad.sql"), "create table public.leaky (id uuid primary key);\ncreate function public.f() returns int language sql as $$ select 1 $$;\n");
  const r = run("preflight.mjs", dir);
  assert.match(r.stdout, /STAGE 2 ARCHITECTURE: MISSING — .*placeholder \{\{LATER\}\}/);
  assert.match(r.stdout, /CHECK env: \.env\.example key EXTRA_KEY not in docs\/ENV_MATRIX\.md/);
  assert.match(r.stdout, /CHECK migrations: 202601010000_bad\.sql creates table leaky without enabling RLS/);
  assert.match(r.stdout, /CHECK migrations: 202601010000_bad\.sql creates function f\(\) without a revoke/);
  assert.equal(r.status, 0, "advisory mode never fails");
  rmSync(dir, { recursive: true, force: true });
});

const kickoffOf = (dir) => readFileSync(join(dir, "docs/KICKOFF.md"), "utf8").replace(/\r\n/g, "\n");

test("strict: a manifest with only stage 0 fails; advisory still exits 0", () => {
  const dir = freshProject();
  writeFileSync(join(dir, "docs/KICKOFF.md"), kickoffOf(dir).split("## Stage 1")[0] + "## Gates\n```gates\nnpm test\n```\n");
  const r = run("preflight.mjs", dir, "--strict");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^STAGE 5 WORKSPACE & HARNESS: MISSING — stage absent/m);
  assert.equal(run("preflight.mjs", dir).status, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("strict: an unparseable KICKOFF.md fails", () => {
  const dir = freshProject();
  writeFileSync(join(dir, "docs/KICKOFF.md"), "nothing useful here\n");
  assert.equal(run("preflight.mjs", dir, "--strict").status, 1);
  rmSync(dir, { recursive: true, force: true });
});

test("strict: an empty gates block fails, and so does gates.mjs", () => {
  const dir = freshProject();
  writeFileSync(join(dir, "docs/KICKOFF.md"), kickoffOf(dir).replace(/```gates\n[\s\S]*?```/, "```gates\n```"));
  const r = run("preflight.mjs", dir, "--strict");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^CHECK gates: /m);
  const g = spawnSync(process.execPath, [join(dir, "scripts/gates.mjs")], { cwd: dir, encoding: "utf8" });
  assert.equal(g.status, 1, g.stdout + g.stderr);
  rmSync(dir, { recursive: true, force: true });
});

test("no KICKOFF.md → single MISSING line, exit 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "kickoff-empty-"));
  const r = run("preflight.mjs", dir);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^STAGE 0 INTAKE: MISSING — docs\/KICKOFF\.md/m);
  rmSync(dir, { recursive: true, force: true });
});
