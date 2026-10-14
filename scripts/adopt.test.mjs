// node --test scripts/adopt.test.mjs
// adopt.mjs maps an existing repo's documents onto kickoff deliverables, writes only docs/KICKOFF.md
// and .kickoff/adopt.json, and ranks gaps by risk.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const env = { ...process.env, CI: "" };
const run = (script, args) => spawnSync(process.execPath, [join(here, script), ...args], { encoding: "utf8", env });
const fixture = (files) => {
  const dir = mkdtempSync(join(tmpdir(), "adopt-"));
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), body);
  }
  return dir;
};
const read = (dir, p) => readFileSync(join(dir, p), "utf8");
const ledger = (dir) => read(dir, ".kickoff/HISTORY.jsonl").split("\n").filter(Boolean).map((l) => JSON.parse(l));

test("existing docs are mapped, not duplicated; --write writes the manifest and refuses to replace it", () => {
  const dir = fixture({
    "package.json": JSON.stringify({ name: "demo-app", scripts: { typecheck: "x", test: "x", build: "x" }, dependencies: { next: "1", "@supabase/supabase-js": "1" } }),
    "docs/architecture.md": "# Architecture\n\nOne server.\n",
    "STATE.md": "# State\n",
    "CLAUDE.md": "# Rules\n",
    ".github/workflows/ci.yml": "on: push\n",
    ".env.example": "API_URL=\n",
  });
  const dry = run("adopt.mjs", [dir]);
  assert.equal(dry.status, 0);
  assert.match(dry.stdout, /^STACK: nextjs, supabase$/m);
  assert.match(dry.stdout, /^MAP docs\/ARCHITECTURE\.md -> docs\/architecture\.md$/m);
  assert.match(dry.stdout, /^PRESENT STATE\.md$/m);
  assert.match(dry.stdout, /^GAP medium: rules live in CLAUDE\.md; lesson L100/m);
  assert.match(dry.stdout, /dry run: nothing written; re-run with --write\s*$/);
  assert.ok(!existsSync(join(dir, "docs/KICKOFF.md")));
  assert.ok(!existsSync(join(dir, ".kickoff")));

  const w = run("adopt.mjs", [dir, "--write"]);
  assert.equal(w.status, 0, w.stderr);
  const manifest = read(dir, "docs/KICKOFF.md");
  assert.match(manifest, /\| `docs\/architecture\.md` \|/);
  assert.doesNotMatch(manifest, /\{\{/);
  assert.match(manifest, /```gates\r?\nnpm run typecheck\r?\nnpm run test\r?\nnpm run build\r?\n```/);
  assert.match(manifest, /Kickoff tracker — demo-app/);
  const adopt = JSON.parse(read(dir, ".kickoff/adopt.json"));
  assert.equal(adopt.v, 1);
  assert.equal(adopt.mapped["docs/ARCHITECTURE.md"], "docs/architecture.md");
  assert.equal(adopt.mapped["AGENTS.md"], "CLAUDE.md");
  assert.ok(adopt.gaps.some((g) => g.id === "rules-claude-only" && g.risk === "medium"));
  assert.match(run("preflight.mjs", [dir]).stdout, /STAGE 2 ARCHITECTURE: READY/);
  assert.equal(read(dir, "docs/architecture.md"), "# Architecture\n\nOne server.\n");
  assert.equal(ledger(dir).filter((r) => r.event === "adopt").length, 1);

  const again = run("adopt.mjs", [dir, "--write"]);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /docs\/KICKOFF\.md exists; pass --force to replace it/);
  assert.equal(run("adopt.mjs", [dir, "--write", "--force"]).status, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("bare repo: high no-gates and no-ci, low missing gaps; template paths kept, supabase rows dropped", () => {
  const dir = fixture({ "package.json": JSON.stringify({ name: "demo-app" }) });
  const r = run("adopt.mjs", [dir]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^STACK: none detected$/m);
  assert.match(r.stdout, /^GAP high: no gate commands found/m);
  assert.match(r.stdout, /^GAP high: no CI workflow/m);
  assert.match(r.stdout, /^GAP low: docs\/DOMAIN\.md missing$/m);
  const risks = r.stdout.split("\n").filter((l) => l.startsWith("GAP ")).map((l) => l.split(/[ :]/)[1]);
  assert.deepEqual(risks, [...risks].sort((a, b) => ["high", "medium", "low"].indexOf(a) - ["high", "medium", "low"].indexOf(b)));
  assert.equal(run("adopt.mjs", [dir, "--write"]).status, 0);
  const manifest = read(dir, "docs/KICKOFF.md");
  assert.match(manifest, /`docs\/ARCHITECTURE\.md`/);
  assert.match(manifest, /`docs\/MIGRATION_RUNBOOK\.md`/);
  assert.match(manifest, /# add your gate commands here/);
  for (const p of ["_TEMPLATE.sql", "auth_hook.sql", "db-types.mjs", "rls-auditor.md"]) assert.ok(!manifest.includes(p), p);
  assert.ok(manifest.includes("service-role-guard.js"), "the guard stays: settings.json wires it");
  rmSync(dir, { recursive: true, force: true });
});

test("two architecture files: the first alias wins and the conflict is reported", () => {
  const dir = fixture({ "ARCHITECTURE.md": "# A\n", "docs/architecture.md": "# B\n" });
  const r = run("adopt.mjs", [dir, "--write"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^MAP docs\/ARCHITECTURE\.md -> ARCHITECTURE\.md$/m);
  assert.match(r.stdout, /^GAP medium: ARCHITECTURE\.md and docs\/architecture\.md both look like docs\/ARCHITECTURE\.md/m);
  assert.deepEqual(readdirSync(dir).filter((f) => /architecture/i.test(f)), ["ARCHITECTURE.md"]);
  assert.deepEqual(readdirSync(join(dir, "docs")).filter((f) => /architecture/i.test(f)), ["architecture.md"]);
  rmSync(dir, { recursive: true, force: true });
});

test("a committed .env is a high gap", (t) => {
  if (spawnSync("git", ["--version"]).status !== 0) return t.skip("git not available");
  const dir = fixture({ ".env": "SECRET=x\n", ".env.example": "SECRET=\n" });
  const git = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...a], { cwd: dir });
  git("init", "-q"); git("add", "."); git("commit", "-q", "-m", "init");
  const r = run("adopt.mjs", [dir]);
  assert.match(r.stdout, /^GAP high: real env file \.env is committed/m);
  assert.doesNotMatch(r.stdout, /real env file \.env\.example/);
  rmSync(dir, { recursive: true, force: true });
});

test("a CRLF shell script is a high gap", () => {
  const dir = fixture({ "scripts/deploy.sh": "#!/bin/bash\r\nset -o pipefail\r\n" });
  assert.match(run("adopt.mjs", [dir]).stdout, /^GAP high: scripts\/deploy\.sh has CRLF line endings/m);
  rmSync(dir, { recursive: true, force: true });
});

test("missing root exits 1 with usage", () => {
  const r = run("adopt.mjs", [join(tmpdir(), "adopt-does-not-exist-xyz")]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage: adopt\.mjs/);
  assert.equal(run("adopt.mjs", []).status, 1);
});
