// node --test scripts/render-mapping.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

test("adopt mapping skips deliverable and leaves mapped file unchanged", () => {
  const dir = tmp();
  mkdirSync(join(dir, "docs"), { recursive: true });
  const existing = "EXISTING ARCH DOC\n";
  writeFileSync(join(dir, "docs/architecture.md"), existing);
  withAdoptMapping(dir, { "docs/ARCHITECTURE.md": "docs/architecture.md" });

  const r = render(dir, "--stage", "2");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /skip\s+docs\/ARCHITECTURE\.md \(mapped to docs\/architecture\.md\)/);
  assert.equal(readFileSync(join(dir, "docs/architecture.md"), "utf8"), existing);
  assert.equal(readFileSync(join(dir, "docs/ARCHITECTURE.md"), "utf8"), existing);

  const forced = render(dir, "--stage", "2", "--force");
  assert.equal(forced.status, 0, forced.stderr);
  assert.match(forced.stdout, /skip\s+docs\/ARCHITECTURE\.md \(mapped to docs\/architecture\.md\)/);
  assert.equal(readFileSync(join(dir, "docs/architecture.md"), "utf8"), existing);
  assert.equal(readFileSync(join(dir, "docs/ARCHITECTURE.md"), "utf8"), existing);
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
