#!/usr/bin/env node
// Kickoff event ledger: one JSON line per event in <project>/.kickoff/HISTORY.jsonl (append-only,
// committed with the project, never holds secrets). measure.mjs reads it. Schema: docs/METRICS.md.
//   node log.mjs <project-root> <event> [--stage N] [--id X] [--note "text"]
// Events an agent logs by hand: stage_start, owner_action_open, owner_action_done, blocker, pilot.
// render.mjs, preflight.mjs and gates.mjs log their own events (render, regenerate, stage_ready, gate_run).
// Skipped when CI is set, so CI checkouts stay clean.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, linkSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const isStage = (v) => Number.isInteger(v) && v >= 0 && v <= 6;
const isCount = (v) => Number.isInteger(v) && v >= 0;
const isId = (v) => typeof v === "string" && v.trim() !== "";

// Required fields per event; a row that fails its check is rejected, never appended.
export const SCHEMA = {
  stage_start: { stage: isStage },
  render: { stage: isStage, files: isCount },
  regenerate: { stage: isStage, files: isCount },
  stage_ready: { stage: isStage },
  gate_run: { passed: isCount, failed: isCount },
  adopt: { mapped: isCount, gaps: isCount },
  owner_action_open: { id: isId },
  owner_action_done: { id: isId },
  blocker: {},
  pilot: {},
  build_route: { route: (v) => v === "kickoff" || v === "crew" },
};
export const EVENTS = Object.keys(SCHEMA);

// True when a ledger row matches its event's schema (used by measure.mjs on read).
// Types first, so a hand-edited row (an array event, a numeric ts, an object with toString: null) is
// rejected instead of being coerced or throwing.
export const isValidRow = (r) =>
  typeof r === "object" && r !== null && !Array.isArray(r) &&
  typeof r.event === "string" && Object.hasOwn(SCHEMA, r.event) &&
  typeof r.ts === "string" && !Number.isNaN(Date.parse(r.ts)) &&
  Object.entries(SCHEMA[r.event]).every(([k, ok]) => ok(r[k]));

export function validate(event, fields) {
  if (!Object.hasOwn(SCHEMA, event)) throw new Error(`unknown event ${event}; one of: ${EVENTS.join(", ")}`);
  for (const [k, ok] of Object.entries(SCHEMA[event])) {
    if (!ok(fields[k])) throw new Error(`${event} needs a valid ${k} (got ${JSON.stringify(fields[k])})`);
  }
}

// Random project id, created once and published atomically: the file is written in full under a
// temporary name, then hard-linked into place, which fails if another process got there first.
export function projectId(root) {
  const f = join(root, ".kickoff/project.json");
  if (!existsSync(f)) {
    mkdirSync(join(root, ".kickoff"), { recursive: true });
    const tmp = `${f}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    writeFileSync(tmp, JSON.stringify({ project_id: randomBytes(8).toString("hex") }, null, 2) + "\n");
    try { linkSync(tmp, f); } catch (e) { if (e.code !== "EEXIST") throw e; } finally { unlinkSync(tmp); }
  }
  return JSON.parse(readFileSync(f, "utf8")).project_id;
}

export function logEvent(root, event, fields = {}) {
  if (process.env.CI) return;
  validate(event, fields);
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
  if (opt("stage") !== undefined) fields.stage = /^\d+$/.test(opt("stage")) ? Number(opt("stage")) : NaN;
  if (opt("id") !== undefined) fields.id = opt("id");
  if (opt("note")) fields.note = opt("note");
  try { logEvent(resolve(rootArg), event, fields); } catch (e) { console.error(e.message); process.exit(1); }
}
