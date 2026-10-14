// node --test scripts/build-route.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { crewAvailable } from "./build-route.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const run = (args, opts = {}) =>
  spawnSync(process.execPath, [join(here, "build-route.mjs"), ...args], { encoding: "utf8", ...opts });
const ledger = (dir) =>
  existsSync(join(dir, ".kickoff/HISTORY.jsonl"))
    ? readFileSync(join(dir, ".kickoff/HISTORY.jsonl"), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

test("crewAvailable: PATH dir with crew.cmd", () => {
  const bin = mkdtempSync(join(tmpdir(), "crew-path-"));
  writeFileSync(join(bin, "crew.cmd"), "@echo off\n");
  const r = crewAvailable({ env: { PATH: bin }, home: mkdtempSync(join(tmpdir(), "crew-home-")) });
  assert.deepEqual(r, { available: true, via: "path" });
  rmSync(bin, { recursive: true, force: true });
});

test("crewAvailable: skill install when PATH has no crew", () => {
  const home = mkdtempSync(join(tmpdir(), "crew-skill-"));
  const skill = join(home, ".claude/skills/crew");
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, "SKILL.md"), "# crew\n");
  const empty = mkdtempSync(join(tmpdir(), "crew-empty-path-"));
  const r = crewAvailable({ env: { PATH: empty }, home });
  assert.deepEqual(r, { available: true, via: "skill" });
  rmSync(home, { recursive: true, force: true });
  rmSync(empty, { recursive: true, force: true });
});

test("crewAvailable: neither path nor skill; missing PATH entry does not throw", () => {
  const home = mkdtempSync(join(tmpdir(), "crew-none-"));
  const r = crewAvailable({ env: { PATH: "/no/such/dir" + (process.platform === "win32" ? ";" : ":") }, home });
  assert.deepEqual(r, { available: false, via: null });
  rmSync(home, { recursive: true, force: true });
});

test("CLI --choose kickoff appends build_route row without feature name", () => {
  const dir = mkdtempSync(join(tmpdir(), "crew-choose-"));
  const env = { ...process.env, CI: "" };
  const r = run([dir, "--choose", "kickoff"], { env });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /route: kickoff/);
  const rows = ledger(dir);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event, "build_route");
  assert.equal(rows[0].route, "kickoff");
  assert.ok(!Object.hasOwn(rows[0], "feature"));
  assert.ok(!Object.hasOwn(rows[0], "name"));
  rmSync(dir, { recursive: true, force: true });
});

test("CLI --choose crew when crew not installed exits 1 and does not create ledger", () => {
  const dir = mkdtempSync(join(tmpdir(), "crew-no-"));
  const emptyHome = mkdtempSync(join(tmpdir(), "crew-empty-home-"));
  const emptyPath = mkdtempSync(join(tmpdir(), "crew-empty-path2-"));
  const env = { ...process.env, CI: "", PATH: emptyPath, Path: emptyPath, HOME: emptyHome, USERPROFILE: emptyHome };
  const r = run([dir, "--choose", "crew"], { env });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /crew is not installed/);
  assert.equal(existsSync(join(dir, ".kickoff/HISTORY.jsonl")), false);
  rmSync(dir, { recursive: true, force: true });
  rmSync(emptyHome, { recursive: true, force: true });
  rmSync(emptyPath, { recursive: true, force: true });
});

test("CLI --choose other exits 1", () => {
  const dir = mkdtempSync(join(tmpdir(), "crew-bad-"));
  const r = run([dir, "--choose", "other"], { env: { ...process.env, CI: "" } });
  assert.equal(r.status, 1);
  rmSync(dir, { recursive: true, force: true });
});
