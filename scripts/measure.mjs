#!/usr/bin/env node
// Reads <project>/.kickoff/HISTORY.jsonl and prints the kickoff metrics (definitions: docs/METRICS.md).
//   node measure.mjs [project-root] [--json]
// Missing data is shown as "n/a", never as zero.
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DAY = 86400000;
const days = (ms) => Math.round((ms / DAY) * 10) / 10;

export function measure(rows) {
  const t = (r) => Date.parse(r.ts);
  const of = (e) => rows.filter((r) => r.event === e);
  const first = rows.length ? Math.min(...rows.map(t)) : null;

  // Stage time: first stage_start (else first render) to first stage_ready.
  const stages = {};
  for (let n = 0; n <= 5; n++) {
    const begin = of("stage_start").find((r) => r.stage === n) ?? of("render").find((r) => r.stage === n);
    const end = of("stage_ready").find((r) => r.stage === n);
    stages[n] = begin && end ? days(t(end) - t(begin)) : null;
  }

  // Owner actions: open → done by id; still-open ones report their age.
  // Rows without a valid id or count (a hand-edited ledger) are left out, not guessed.
  const hasId = (r) => typeof r.id === "string" && r.id.trim() !== "";
  const opened = of("owner_action_open").filter(hasId), closed = new Map(of("owner_action_done").filter(hasId).map((r) => [r.id, r]));
  const now = Date.now();
  const actions = opened.map((r) => ({ id: r.id, days: days((closed.has(r.id) ? t(closed.get(r.id)) : now) - t(r)), open: !closed.has(r.id) }));

  const openDays = actions.filter((a) => a.open).map((a) => a.days);
  const gates = of("gate_run").filter((g) => Number.isInteger(g.failed));
  const pilot = of("pilot")[0];
  return {
    events: rows.length,
    idea_to_pilot_days: first !== null && pilot ? days(t(pilot) - first) : null,
    stage_days: stages,
    owner_actions: { total: actions.length, open: openDays.length, oldest_open_days: openDays.length ? Math.max(...openDays) : null, list: actions },
    gate_runs: gates.length,
    gate_pass_rate: gates.length ? Math.round((gates.filter((g) => g.failed === 0).length / gates.length) * 100) / 100 : null,
    regenerations: of("regenerate").length,
    blockers: of("blocker").length,
  };
}

export function readLedger(root) {
  const f = join(root, ".kickoff/HISTORY.jsonl");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const root = resolve(args.find((a) => !a.startsWith("--")) ?? ".");
  const rows = readLedger(root);
  if (!rows.length) { console.log("No ledger yet: .kickoff/HISTORY.jsonl is missing or empty."); process.exit(0); }
  const m = measure(rows);
  if (args.includes("--json")) { console.log(JSON.stringify(m, null, 2)); process.exit(0); }
  const na = (v, unit = "") => (v === null ? "n/a" : `${v}${unit}`);
  console.log(`Events: ${m.events}`);
  console.log(`Idea to pilot: ${na(m.idea_to_pilot_days, " days")}`);
  console.log(`Stage days: ${Object.entries(m.stage_days).map(([n, d]) => `${n}=${na(d)}`).join("  ")}`);
  console.log(`Owner actions: ${m.owner_actions.total} total, ${m.owner_actions.open} open, oldest open ${na(m.owner_actions.oldest_open_days, " days")}`);
  console.log(`Gate runs: ${m.gate_runs}, pass rate ${na(m.gate_pass_rate)}`);
  console.log(`Regenerations: ${m.regenerations}; blockers: ${m.blockers}`);
}
