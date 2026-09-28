#!/usr/bin/env node
// Runs every command in the ```gates block of docs/KICKOFF.md, in order, in the current
// directory. Prints PASS/FAIL per command with raw output, runs ALL of them even after a
// failure, exits non-zero if any failed. No dependencies. Works in a clean worktree with no .env.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const md = readFileSync("docs/KICKOFF.md", "utf8");
const block = md.match(/```gates\r?\n([\s\S]*?)```/);
if (!block) {
  console.error("No ```gates block in docs/KICKOFF.md");
  process.exit(1);
}
const commands = block[1].split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

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
process.exit(failed ? 1 : 0);
