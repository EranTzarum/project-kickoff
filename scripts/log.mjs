#!/usr/bin/env node
// Kickoff event ledger: one JSON line per event in <project>/.kickoff/HISTORY.jsonl (append-only,
// committed with the project, never holds secrets). measure.mjs reads it. Schema: docs/METRICS.md.
//   node log.mjs <project-root> <event> [--stage N] [--id X] [--note "text"]
// Events an agent logs by hand: stage_start, owner_action_open, owner_action_done, blocker, pilot.
// render.mjs, preflight.mjs and gates.mjs log their own events (render, regenerate, stage_ready, gate_run).
// Skipped when CI is set, so CI checkouts stay clean.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

export const EVENTS = ["stage_start", "render", "regenerate", "stage_ready", "gate_run", "owner_action_open", "owner_action_done", "blocker", "pilot"];

// Random project id, created once; never derived from the project's name or path.
export function projectId(root) {
  const f = join(root, ".kickoff/project.json");
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8")).project_id;
  mkdirSync(join(root, ".kickoff"), { recursive: true });
  const id = randomBytes(8).toString("hex");
  writeFileSync(f, JSON.stringify({ project_id: id }, null, 2) + "\n");
  return id;
}

export function logEvent(root, event, fields = {}) {
  if (process.env.CI) return;
  if (!EVENTS.includes(event)) throw new Error(`unknown event ${event}; one of: ${EVENTS.join(", ")}`);
  const row = { v: 1, ts: new Date().toISOString(), project_id: projectId(root), event, ...fields };
  appendFileSync(join(root, ".kickoff/HISTORY.jsonl"), JSON.stringify(row) + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [rootArg, event, ...rest] = process.argv.slice(2);
  if (!rootArg || !event) {
    console.error(`usage: log.mjs <project-root> <event> [--stage N] [--id X] [--note "text"]\nevents: ${EVENTS.join(", ")}`);
    process.exit(1);
  }
  const opt = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : undefined; };
  const fields = {};
  if (opt("stage") !== undefined) fields.stage = Number(opt("stage"));
  if (opt("id")) fields.id = opt("id");
  if (opt("note")) fields.note = opt("note");
  try { logEvent(resolve(rootArg), event, fields); } catch (e) { console.error(e.message); process.exit(1); }
}
