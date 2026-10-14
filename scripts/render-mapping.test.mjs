// node --test scripts/render-mapping.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const answers = join(here, "../templates/answers.example.json");
const render = (dir, ...extra) =>
  spawnSync(process.execPath, [join(here, "render.mjs"), dir, answers, ...extra], { encoding: "utf8" });
const preflight = (dir, ...extra) =>
  spawnSync(process.execPath, [join(here, "preflight.mjs"), dir, ...extra], { encoding: "utf8" });
const tmp = () => mkdtempSync(join(tmpdir(), "render-map-"));

function withAdoptMapping(dir, mapped) {
  mkdirSync(join(dir, ".kickoff"), { recursive: true });
  writeFileSync(join(dir, ".kickoff/adopt.json"), JSON.stringify({ v: 1, mapped }));
}

// Name-exact existence check, so the test means the same on case-insensitive and case-sensitive filesystems.
const hasExact = (dir, rel) => readdirSync(join(dir, dirname(rel))).includes(rel.split("/").pop());

test("adopt mapping skips deliverable and leaves mapped file unchanged", () => {
  const dir = tmp();
  const existing = "EXISTING ARCH DOC\n";
  writeFileSync(join(dir, "ARCHITECTURE.md"), existing);
  withAdoptMapping(dir, { "docs/ARCHITECTURE.md": "ARCHITECTURE.md" });

  for (const extra of [[], ["--force"]]) {
    const r = render(dir, "--stage", "2", ...extra);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /skip\s+docs\/ARCHITECTURE\.md \(mapped to ARCHITECTURE\.md\)/);
    assert.equal(readFileSync(join(dir, "ARCHITECTURE.md"), "utf8"), existing);
    assert.equal(existsSync(join(dir, "docs")) && hasExact(dir, "docs/ARCHITECTURE.md"), false, "no parallel doc");
  }
  rmSync(dir, { recursive: true, force: true });
});

test("adopted repo: dropped rows, the manifest and mapped paths are respected by a full render, also with --force", () => {
  const dir = tmp();
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "demo-api", scripts: { test: "x" } }));
  writeFileSync(join(dir, "PROGRESS.md"), "# progress\n");
  writeFileSync(join(dir, ".env.sample"), "API_KEY=\n");
  const adopt = spawnSync(process.execPath, [join(here, "adopt.mjs"), dir, "--write"], { encoding: "utf8" });
  assert.equal(adopt.status, 0, adopt.stderr);
  const manifest = readFileSync(join(dir, "docs/KICKOFF.md"), "utf8");

  for (const extra of [[], ["--force"]]) {
    const r = render(dir, ...extra);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /skip\s+docs\/KICKOFF\.md \(written by adopt/);
    assert.equal(readFileSync(join(dir, "docs/KICKOFF.md"), "utf8"), manifest, "manifest kept");
    for (const f of ["supabase/migrations/_TEMPLATE.sql", "scripts/db-types.mjs", ".claude/agents/rls-auditor.md"]) {
      assert.equal(existsSync(join(dir, f)), false, `${f} is not used without Supabase`);
    }
    assert.ok(existsSync(join(dir, ".claude/hooks/service-role-guard.js")), "settings.json still wires the guard");
    assert.equal(existsSync(join(dir, "STATE.md")), false, "no parallel state file");
    assert.equal(existsSync(join(dir, ".env.example")), false, "no parallel env template");
  }
  const rules = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert.match(rules, /`PROGRESS\.md`/, "rendered docs point at the adopted file");
  assert.doesNotMatch(rules, /`STATE\.md`/);
  rmSync(dir, { recursive: true, force: true });
});

test("preflight env cross-check reads the adopted env files", () => {
  const dir = tmp();
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "demo-api" }));
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs/environments.md"), "| KEY | Purpose |\n|---|---|\n| API_KEY | x |\n");
  writeFileSync(join(dir, ".env.sample"), "API_KEY=\nEXTRA_KEY=\n");
  assert.equal(spawnSync(process.execPath, [join(here, "adopt.mjs"), dir, "--write"], { encoding: "utf8" }).status, 0);
  const r = preflight(dir);
  assert.match(r.stdout, /CHECK env: \.env\.sample key EXTRA_KEY not in docs\/environments\.md/);
  rmSync(dir, { recursive: true, force: true });
});

test("unparseable adopt.json is ignored and render proceeds", () => {
  const dir = tmp();
  mkdirSync(join(dir, ".kickoff"), { recursive: true });
  writeFileSync(join(dir, ".kickoff/adopt.json"), "{ not json");

  const r = render(dir, "--stage", "2");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /NOTE adopt\.json: ignored/);
  assert.match(r.stdout, /write\s+docs\/ARCHITECTURE\.md/);
  assert.ok(existsSync(join(dir, "docs/ARCHITECTURE.md")));
  rmSync(dir, { recursive: true, force: true });
});

test("preflight without KICKOFF.md detects existing project markers", () => {
  const withPkg = tmp();
  writeFileSync(join(withPkg, "package.json"), "{}");
  const detected = preflight(withPkg);
  assert.equal(detected.status, 0);
  assert.match(
    detected.stdout,
    /STAGE 0 INTAKE: MISSING — docs\/KICKOFF\.md \(existing project detected: package\.json; run \/project-kickoff adopt\)/,
  );

  const empty = tmp();
  const fresh = preflight(empty);
  assert.equal(fresh.status, 0);
  assert.match(
    fresh.stdout,
    /STAGE 0 INTAKE: MISSING — docs\/KICKOFF\.md \(run \/project-kickoff to generate it\)/,
  );
  rmSync(withPkg, { recursive: true, force: true });
  rmSync(empty, { recursive: true, force: true });
});
