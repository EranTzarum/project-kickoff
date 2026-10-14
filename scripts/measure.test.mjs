// node --test scripts/measure.test.mjs
// The kickoff ledger: render, preflight and gates.mjs append events; log.mjs takes manual events;
// measure.mjs turns a ledger into metrics, with missing data as null, never zero.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { measure } from "./measure.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const answers = join(here, "../templates/answers.example.json");
const env = { ...process.env, CI: "" };
const run = (script, args, opts = {}) => spawnSync(process.execPath, [join(here, script), ...args], { encoding: "utf8", env, ...opts });
const ledger = (dir) => existsSync(join(dir, ".kickoff/HISTORY.jsonl"))
  ? readFileSync(join(dir, ".kickoff/HISTORY.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];

test("render logs one render row per stage; --force logs regenerate; ids are random, not derived", () => {
  const dir = mkdtempSync(join(tmpdir(), "measure-"));
  run("render.mjs", [dir, answers]);
  const rows = ledger(dir);
  assert.deepEqual(rows.filter((r) => r.event === "render").map((r) => r.stage).sort(), [0, 1, 2, 3, 4, 5]);
  assert.match(rows[0].project_id, /^[0-9a-f]{16}$/);
  assert.ok(rows.every((r) => r.v === 1 && r.ts));
  run("render.mjs", [dir, answers, "--stage", "1", "--force"]);
  assert.equal(ledger(dir).filter((r) => r.event === "regenerate" && r.stage === 1).length, 1);
  rmSync(dir, { recursive: true, force: true });
});

test("preflight logs stage_ready once per stage, and nothing under CI", () => {
  const dir = mkdtempSync(join(tmpdir(), "measure-"));
  run("render.mjs", [dir, answers]);
  run("preflight.mjs", [dir]);
  run("preflight.mjs", [dir]);
  const ready = ledger(dir).filter((r) => r.event === "stage_ready").map((r) => r.stage).sort();
  assert.deepEqual(ready, [0, 1, 2, 3, 4, 5]);
  const before = ledger(dir).length;
  spawnSync(process.execPath, [join(here, "preflight.mjs"), dir], { env: { ...process.env, CI: "true" } });
  assert.equal(ledger(dir).length, before, "CI run must not write");
  rmSync(dir, { recursive: true, force: true });
});

test("gates.mjs logs a gate_run row with pass and fail counts", () => {
  const dir = mkdtempSync(join(tmpdir(), "measure-"));
  run("render.mjs", [dir, answers]);
  const f = join(dir, "docs/KICKOFF.md");
  writeFileSync(f, readFileSync(f, "utf8").replace(/```gates\r?\n[\s\S]*?```/, "```gates\nnode -e \"process.exit(0)\"\nnode -e \"process.exit(3)\"\n```"));
  spawnSync(process.execPath, [join(dir, "scripts/gates.mjs")], { cwd: dir, encoding: "utf8", env });
  const g = ledger(dir).filter((r) => r.event === "gate_run");
  assert.equal(g.length, 1);
  assert.deepEqual([g[0].passed, g[0].failed], [1, 1]);
  rmSync(dir, { recursive: true, force: true });
});

test("log.mjs appends manual events and rejects unknown ones", () => {
  const dir = mkdtempSync(join(tmpdir(), "measure-"));
  assert.equal(run("log.mjs", [dir, "owner_action_open", "--id", "smtp", "--note", "custom SMTP"]).status, 0);
  assert.equal(run("log.mjs", [dir, "pilot"]).status, 0);
  assert.equal(run("log.mjs", [dir, "made_up"]).status, 1);
  assert.deepEqual(ledger(dir).map((r) => r.event), ["owner_action_open", "pilot"]);
  assert.equal(ledger(dir)[0].id, "smtp");
  rmSync(dir, { recursive: true, force: true });
});

test("log.mjs rejects rows missing their required fields, and appends nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "measure-"));
  for (const args of [["toString"], ["constructor"], ["__proto__"], ["owner_action_open"], ["owner_action_done", "--id", " "], ["stage_start"], ["stage_start", "--stage", "x"], ["stage_start", "--stage", "9"]]) {
    assert.equal(run("log.mjs", [dir, ...args]).status, 1, args.join(" "));
  }
  assert.deepEqual(ledger(dir), []);
  rmSync(dir, { recursive: true, force: true });
});

test("ledger problems never change preflight's or gates.mjs's exit code", () => {
  const dir = mkdtempSync(join(tmpdir(), "measure-"));
  run("render.mjs", [dir, answers]);
  writeFileSync(join(dir, ".kickoff/project.json"), "{ not json");
  const r = run("preflight.mjs", [dir]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /NOTE ledger: not recorded/);
  assert.equal(run("preflight.mjs", [dir, "--strict"]).status, 0, "strict still passes a complete project");
  const g = spawnSync(process.execPath, [join(dir, "scripts/gates.mjs")], { cwd: dir, encoding: "utf8", env });
  assert.match(g.stdout, /NOTE ledger: not recorded/);
  rmSync(dir, { recursive: true, force: true });
});

test("concurrent first logs share one project id", async () => {
  const dir = mkdtempSync(join(tmpdir(), "measure-"));
  const one = () => new Promise((ok) => spawn(process.execPath, [join(here, "log.mjs"), dir, "pilot"], { env }).on("exit", ok));
  await Promise.all(Array.from({ length: 8 }, one));
  const rows = ledger(dir);
  assert.equal(rows.length, 8);
  assert.equal(new Set(rows.map((r) => r.project_id)).size, 1);
  assert.equal(JSON.parse(readFileSync(join(dir, ".kickoff/project.json"), "utf8")).project_id, rows[0].project_id);
  rmSync(dir, { recursive: true, force: true });
});

test("measure: stage days, pilot, owner actions, gate pass rate; missing data is null", () => {
  const at = (d) => new Date(Date.UTC(2026, 0, 1) + d * 86400000).toISOString();
  const rows = [
    { ts: at(0), event: "stage_start", stage: 0 },
    { ts: at(1), event: "stage_ready", stage: 0 },
    { ts: at(1), event: "render", stage: 1, files: 1 },
    { ts: at(3.5), event: "stage_ready", stage: 1 },
    { ts: at(0), event: "owner_action_open", id: "billing" },
    { ts: at(2), event: "owner_action_done", id: "billing" },
    { ts: at(4), event: "gate_run", passed: 4, failed: 0 },
    { ts: at(5), event: "gate_run", passed: 3, failed: 1 },
    { ts: at(5), event: "regenerate", stage: 1, files: 1 },
    { ts: at(12), event: "pilot" },
  ];
  const m = measure(rows);
  assert.equal(m.idea_to_pilot_days, 12);
  assert.equal(m.stage_days[0], 1);
  assert.equal(m.stage_days[1], 2.5);
  assert.equal(m.stage_days[2], null);
  assert.deepEqual([m.owner_actions.total, m.owner_actions.open, m.owner_actions.oldest_open_days], [1, 0, null]);
  assert.equal(m.owner_actions.list[0].days, 2);
  assert.equal(m.gate_pass_rate, 0.5);
  assert.equal(m.regenerations, 1);
  const bad = measure([
    { ts: at(0), event: "owner_action_open" }, { ts: at(1), event: "owner_action_done" },
    { ts: at(1), event: "gate_run" }, { ts: at(1), event: "gate_run", failed: 0 }, { ts: at(1), event: "gate_run", passed: 2, failed: -1 },
    { ts: at(1), event: "toString" }, { ts: "not a date", event: "pilot" },
    { ts: at(0), event: ["pilot"] }, { ts: 0, event: "pilot" }, { ts: { toString: null }, event: "pilot" },
    { ts: at(0), event: { toString: null } }, null, [], "pilot",
  ]);
  assert.equal(bad.owner_actions.total, 0, "rows without an id are left out");
  assert.equal(bad.gate_pass_rate, null, "gate rows without both non-negative counts are left out");
  assert.equal(bad.idea_to_pilot_days, null);
  assert.equal(bad.rows_ignored, 14);
  const empty = measure([]);
  assert.equal(empty.idea_to_pilot_days, null);
  assert.equal(empty.gate_pass_rate, null);
});

test("measure CLI: no ledger says so; a ledger prints the summary", () => {
  const dir = mkdtempSync(join(tmpdir(), "measure-"));
  assert.match(run("measure.mjs", [dir]).stdout, /No ledger yet/);
  run("log.mjs", [dir, "stage_start", "--stage", "0"]);
  const r = run("measure.mjs", [dir]);
  assert.match(r.stdout, /Idea to pilot: n\/a/);
  assert.match(JSON.parse(run("measure.mjs", [dir, "--json"]).stdout).events.toString(), /^1$/);
  rmSync(dir, { recursive: true, force: true });
});
