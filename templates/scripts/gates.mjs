#!/usr/bin/env node
// Runs every command in the ```gates block of docs/KICKOFF.md, in order, in the current
// directory. Prints PASS/FAIL per command with raw output, runs ALL of them even after a
// failure, exits non-zero if any failed. No dependencies. Works in a clean worktree with no .env.
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const md = readFileSync("docs/KICKOFF.md", "utf8");
const block = md.match(/```gates\r?\n([\s\S]*?)```/);
if (!block) {
  console.error("No ```gates block in docs/KICKOFF.md");
  process.exit(1);
}
const commands = block[1].split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
if (commands.length === 0) {
  console.error("The ```gates block in docs/KICKOFF.md is empty");
  process.exit(1);
}

let failed = 0;
for (const cmd of commands) {
  const t0 = Date.now();
  const r = spawnSync(cmd, { shell: true, encoding: "utf8", env: process.env });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} (${((Date.now() - t0) / 1000).toFixed(1)}s) ${cmd}`);
  if (!ok) console.log((r.stdout + r.stderr).trim());
}
console.log(`\n${commands.length - failed}/${commands.length} gates passed`);
// Kickoff ledger (measure.mjs reads it): one gate_run row per run, never in CI. Best effort: a
// ledger problem prints a NOTE and never changes the exit code.
if (!process.env.CI && existsSync(".kickoff/project.json")) {
  try {
    const { project_id } = JSON.parse(readFileSync(".kickoff/project.json", "utf8"));
    appendFileSync(".kickoff/HISTORY.jsonl", JSON.stringify({ v: 1, ts: new Date().toISOString(), project_id, event: "gate_run", passed: commands.length - failed, failed }) + "\n");
  } catch (e) {
    console.log(`NOTE ledger: not recorded (${e.message})`);
  }
}
process.exit(failed ? 1 : 0);
