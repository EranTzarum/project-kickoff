// node --test scripts/retro.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { draftCandidates, parseCandidates, saveLessons, readStore, draftTrackedReason } from "./retro.mjs";

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

test("CLI draft, force, and pipe in mistake cell", () => {
  const dir = project();
  const store = mkdtempSync(join(tmpdir(), "retro-store-"));
  const env = { PROJECT_KICKOFF_HOME: store };
  writeFileSync(join(dir, "STATE.md"), "## Mistakes\n- used a|b in config\n");
  assert.equal(run([dir], env).status, 0);
  const text = readFileSync(join(dir, ".kickoff/lessons-candidates.md"), "utf8");
  assert.match(text, /used a\\\|b in config/);
  assert.equal(run([dir], env).status, 1);
  assert.equal(run([dir, "--force"], env).status, 0);
  const parsed = parseCandidates(text);
  assert.equal(parsed[0].what, "used a|b in config");
  rmSync(dir, { recursive: true, force: true });
  rmSync(store, { recursive: true, force: true });
});

test("--save and duplicate skip with project_id", () => {
  const dir = project();
  const store = mkdtempSync(join(tmpdir(), "retro-store-"));
  const env = { PROJECT_KICKOFF_HOME: store };
  mkdirSync(join(dir, ".kickoff"), { recursive: true });
  writeFileSync(join(dir, ".kickoff/project.json"), JSON.stringify({ project_id: "feedfacefeedface" }) + "\n");
  writeFileSync(join(dir, "STATE.md"), "## Mistakes\n- one\n- two\n");
  run([dir], env);
  let md = readFileSync(join(dir, ".kickoff/lessons-candidates.md"), "utf8");
  md = md.replace("(write the rule)", "Always check gates", 1);
  writeFileSync(join(dir, ".kickoff/lessons-candidates.md"), md);
  const r1 = run([dir, "--save"], env);
  assert.equal(r1.status, 0);
  assert.match(r1.stdout, /saved 1, skipped 1 \(no rule\), 0 already saved/);
  const line = readStore(store)[0];
  assert.equal(line.project_id, "feedfacefeedface");
  assert.equal(line.rule, "Always check gates");
  const r2 = run([dir, "--save"], env);
  assert.match(r2.stdout, /saved 0, skipped 1 \(no rule\), 1 already saved/);
  rmSync(dir, { recursive: true, force: true });
  rmSync(store, { recursive: true, force: true });
});

test("--list empty and with saved row", () => {
  const store = mkdtempSync(join(tmpdir(), "retro-store-"));
  const env = { PROJECT_KICKOFF_HOME: store };
  const empty = run(["--list"], env);
  assert.equal(empty.status, 0);
  assert.match(empty.stdout, /no saved lessons/);
  mkdirSync(store, { recursive: true });
  writeFileSync(join(store, "lessons.jsonl"), JSON.stringify({ v: 1, saved: "2026-01-01T00:00:00.000Z", project_id: "x", date: "2026-01-01", category: "process", what: "trap", evidence: "STATE.md", rule: "avoid trap", stage: "build-loop", class: "CANDIDATE REUSABLE" }) + "\n");
  const listed = run(["--list"], env);
  assert.match(listed.stdout, /avoid trap/);
  rmSync(store, { recursive: true, force: true });
});

test("the draft is git-ignored; a project without an id gets one on save; --list shows the project", () => {
  const dir = project();
  const store = mkdtempSync(join(tmpdir(), "retro-store-"));
  const env = { PROJECT_KICKOFF_HOME: store };
  writeFileSync(join(dir, "STATE.md"), "## Mistakes\n- one\n");
  assert.equal(run([dir], env).status, 0);
  assert.equal(readFileSync(join(dir, ".kickoff/.gitignore"), "utf8"), "lessons-candidates.md\n");
  assert.equal(run([dir, "--force"], env).status, 0);
  assert.equal(readFileSync(join(dir, ".kickoff/.gitignore"), "utf8"), "lessons-candidates.md\n", "not added twice");
  const f = join(dir, ".kickoff/lessons-candidates.md");
  writeFileSync(f, readFileSync(f, "utf8").replace("(write the rule)", "Do it once"));
  assert.equal(existsSync(join(dir, ".kickoff/project.json")), false);
  assert.equal(run([dir, "--save"], env).status, 0);
  const pid = JSON.parse(readFileSync(join(dir, ".kickoff/project.json"), "utf8")).project_id;
  assert.equal(readStore(store)[0].project_id, pid);
  const listed = run(["--list"], env);
  assert.match(listed.stdout, /\| project \|/);
  assert.ok(listed.stdout.includes(`| ${pid.slice(0, 8)} |`));
  rmSync(dir, { recursive: true, force: true });
  rmSync(store, { recursive: true, force: true });
});

test("a draft that git already tracks is never rewritten", () => {
  const dir = mkdtempSync(join(tmpdir(), "retro-git-"));
  const store = mkdtempSync(join(tmpdir(), "retro-store-"));
  const git = (...a) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  mkdirSync(join(dir, ".kickoff"));
  writeFileSync(join(dir, ".kickoff/lessons-candidates.md"), "old draft\n");
  git("add", ".kickoff/lessons-candidates.md");
  writeFileSync(join(dir, "STATE.md"), "## Mistakes\n- secret detail\n");
  const r = run([dir, "--force"], { PROJECT_KICKOFF_HOME: store });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /git rm --cached \.kickoff\/lessons-candidates\.md/);
  // An inherited GIT_DIR pointing at missing metadata does not hide the project's own repo.
  const r2 = run([dir, "--force"], { PROJECT_KICKOFF_HOME: store, GIT_DIR: join(dir, "missing-git-dir") });
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /git rm --cached/);
  assert.equal(readFileSync(join(dir, ".kickoff/lessons-candidates.md"), "utf8"), "old draft\n");
  rmSync(dir, { recursive: true, force: true });
  rmSync(store, { recursive: true, force: true });
});

test("when git cannot be asked, only a readable empty .git is allowed; an untracked draft in a repo is fine", () => {
  const repo = mkdtempSync(join(tmpdir(), "retro-nogit-"));
  mkdirSync(join(repo, ".git"));
  writeFileSync(join(repo, ".git", "index"), "");
  assert.match(draftTrackedReason(repo, "git-binary-that-does-not-exist"), /cannot check/);
  // Anything but a readable, empty folder is refused: a .git file (worktree pointer), or any content.
  rmSync(join(repo, ".git"), { recursive: true, force: true });
  writeFileSync(join(repo, ".git"), "gitdir: elsewhere\n");
  assert.match(draftTrackedReason(repo, "git-binary-that-does-not-exist"), /cannot check/);
  // An access error while looking up .git is a refusal, never "absent".
  rmSync(join(repo, ".git"), { force: true });
  const denied = () => { throw Object.assign(new Error("denied"), { code: "EACCES" }); };
  assert.match(draftTrackedReason(repo, "git-binary-that-does-not-exist", { lstat: denied }), /cannot check/);

  rmSync(repo, { recursive: true, force: true });
  const fresh = project();
  assert.equal(draftTrackedReason(fresh), null, "an untracked draft in a readable repo is fine");
  rmSync(fresh, { recursive: true, force: true });
});

test("a damaged repo (HEAD missing, index intact) still protects a tracked draft", () => {
  const dir = mkdtempSync(join(tmpdir(), "retro-nohead-"));
  const store = mkdtempSync(join(tmpdir(), "retro-store-"));
  const git = (...a) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  mkdirSync(join(dir, ".kickoff"));
  writeFileSync(join(dir, ".kickoff/lessons-candidates.md"), "old draft\n");
  git("add", ".kickoff/lessons-candidates.md");
  rmSync(join(dir, ".git", "HEAD"));
  writeFileSync(join(dir, "STATE.md"), "## Mistakes\n- private detail\n");
  const r = run([dir, "--force"], { PROJECT_KICKOFF_HOME: store });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /cannot check|git rm --cached/);
  assert.equal(readFileSync(join(dir, ".kickoff/lessons-candidates.md"), "utf8"), "old draft\n");
  rmSync(dir, { recursive: true, force: true });
  rmSync(store, { recursive: true, force: true });
});
