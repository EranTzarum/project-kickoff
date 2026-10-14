// node --test scripts/retro.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { draftCandidates, parseCandidates, saveLessons, readStore, draftPath } from "./retro.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const run = (args, env = {}) => spawnSync(process.execPath, [join(here, "retro.mjs"), ...args], { encoding: "utf8", env: { ...process.env, ...env } });
// A kickoff project is a git repo; a plain temp folder could sit under a stray .git, which retro refuses.
const project = () => {
  const d = mkdtempSync(join(tmpdir(), "retro-"));
  spawnSync("git", ["init", "-q"], { cwd: d });
  return d;
};
const ledgerLine = (row) => JSON.stringify({ v: 1, ts: row.ts, project_id: row.project_id ?? "abcd1234abcd1234", event: row.event, ...row }) + "\n";

test("STATE.md mistakes: two rows, dated bullet keeps date, skips (none)", () => {
  const dir = project();
  writeFileSync(join(dir, "STATE.md"), `## Mistakes already made here\n- 2024-06-01 forgot RLS on new table\n- shipped without mobile check\n- (none yet)\n\n## Next\n`);
  const now = new Date("2026-01-15T12:00:00.000Z");
  const rows = draftCandidates(dir, { now });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, "2024-06-01");
  assert.equal(rows[0].what, "forgot RLS on new table");
  assert.equal(rows[1].date, "2026-01-15");
  assert.equal(rows[1].what, "shipped without mobile check");
  rmSync(dir, { recursive: true, force: true });
});

test("ledger-derived candidates", () => {
  const dir = project();
  mkdirSync(join(dir, ".kickoff"), { recursive: true });
  const base = "2026-01-01T00:00:00.000Z";
  const pid = "abcd1234abcd1234";
  const lines = [
    ledgerLine({ ts: base, project_id: pid, event: "blocker", note: "waiting on DNS" }),
    ledgerLine({ ts: "2026-01-01T00:00:00.000Z", project_id: pid, event: "owner_action_open", id: "slow" }),
    ledgerLine({ ts: "2026-01-01T00:00:00.000Z", project_id: pid, event: "owner_action_open", id: "fast" }),
    ledgerLine({ ts: "2026-01-02T00:00:00.000Z", project_id: pid, event: "owner_action_done", id: "fast" }),
    ledgerLine({ ts: base, project_id: pid, event: "gate_run", passed: 0, failed: 1 }),
    ledgerLine({ ts: base, project_id: pid, event: "gate_run", passed: 1, failed: 2 }),
    ledgerLine({ ts: base, project_id: pid, event: "gate_run", passed: 0, failed: 1 }),
    ledgerLine({ ts: base, project_id: pid, event: "gate_run", passed: 2, failed: 0 }),
    ledgerLine({ ts: base, project_id: pid, event: "regenerate", stage: 1, files: 3 }),
    ledgerLine({ ts: base, project_id: pid, event: "regenerate", stage: 1, files: 3 }),
  ];
  writeFileSync(join(dir, ".kickoff/HISTORY.jsonl"), lines.join(""));
  const now = new Date("2026-01-10T00:00:00.000Z");
  const rows = draftCandidates(dir, { now });
  const whats = rows.map((r) => r.what);
  assert.deepEqual(whats, [
    "Work stopped on the owner: waiting on DNS",
    "Owner action slow stayed open 9 days",
    "3 of 4 gate runs failed",
    "Stage domain was regenerated 2 times",
  ]);
  assert.equal(rows.find((r) => r.what.includes("gate")).category, "testing");
  assert.equal(rows.find((r) => r.what.includes("domain")).stage, "domain");
  rmSync(dir, { recursive: true, force: true });
});

test("CLI draft goes to the user store, never the project; --force; a pipe stays in one cell", () => {
  const dir = project();
  const store = mkdtempSync(join(tmpdir(), "retro-store-"));
  const env = { PROJECT_KICKOFF_HOME: store };
  writeFileSync(join(dir, "STATE.md"), "## Mistakes\n- used a|b in config\n");
  const r = run([dir], env);
  assert.equal(r.status, 0, r.stderr);
  const f = draftPath(dir, store);
  assert.ok(f.startsWith(join(store, "drafts")));
  assert.ok(r.stdout.includes(f));
  const text = readFileSync(f, "utf8");
  assert.match(text, /used a\\\|b in config/);
  assert.equal(existsSync(join(dir, ".kickoff/lessons-candidates.md")), false);
  assert.equal(existsSync(join(dir, ".kickoff/.gitignore")), false);
  assert.equal(run([dir], env).status, 1);
  assert.equal(run([dir, "--force"], env).status, 0);
  assert.equal(parseCandidates(text)[0].what, "used a|b in config");
  rmSync(dir, { recursive: true, force: true });
  rmSync(store, { recursive: true, force: true });
});

test("--save reads the store draft, skips rows without a rule and repeats; --list shows the project", () => {
  const dir = project();
  const store = mkdtempSync(join(tmpdir(), "retro-store-"));
  const env = { PROJECT_KICKOFF_HOME: store };
  writeFileSync(join(dir, "STATE.md"), "## Mistakes\n- one\n- two\n");
  assert.equal(run([dir, "--save"], env).status, 1, "no draft yet");
  assert.equal(run([dir], env).status, 0);
  const pid = JSON.parse(readFileSync(join(dir, ".kickoff/project.json"), "utf8")).project_id;
  const f = draftPath(dir, store);
  writeFileSync(f, readFileSync(f, "utf8").replace("(write the rule)", "Always check gates"));
  const r1 = run([dir, "--save"], env);
  assert.equal(r1.status, 0, r1.stderr);
  assert.match(r1.stdout, /saved 1, skipped 1 \(no rule\), 0 already saved/);
  const line = readStore(store)[0];
  assert.equal(line.project_id, pid);
  assert.equal(line.rule, "Always check gates");
  assert.match(run([dir, "--save"], env).stdout, /saved 0, skipped 1 \(no rule\), 1 already saved/);
  const listed = run(["--list"], env);
  assert.match(listed.stdout, /\| project \|/);
  assert.ok(listed.stdout.includes(`| ${pid.slice(0, 8)} |`));
  rmSync(dir, { recursive: true, force: true });
  rmSync(store, { recursive: true, force: true });
});

test("--list empty and with saved row", () => {
  const store = mkdtempSync(join(tmpdir(), "retro-store-"));
  const env = { PROJECT_KICKOFF_HOME: store };
  const empty = run(["--list"], env);
  assert.equal(empty.status, 0);
  assert.match(empty.stdout, /no saved lessons/);
  writeFileSync(join(store, "lessons.jsonl"), JSON.stringify({ v: 1, saved: "2026-01-01T00:00:00.000Z", project_id: "x", date: "2026-01-01", category: "process", what: "trap", evidence: "STATE.md", rule: "avoid trap", stage: "build-loop", class: "CANDIDATE REUSABLE" }) + "\n");
  assert.match(run(["--list"], env).stdout, /avoid trap/);
  rmSync(store, { recursive: true, force: true });
});
