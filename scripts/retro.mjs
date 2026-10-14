#!/usr/bin/env node
// Draft lesson candidates from STATE.md + .kickoff/HISTORY.jsonl; save to the user's lesson store.
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { isValidRow, projectId } from "./log.mjs";

const STAGES = ["intake", "domain", "architecture", "db", "auth-env", "workspace", "build-loop"];
const HDR = "| id | date | category | what happened | evidence | rule | stage | source | class |";
const DAY = 86400000;
const isoDay = (d) => d.toISOString().slice(0, 10);
const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ").trim();
const unesc = (s) => s.replace(/\\\|/g, "|");

export function storeDir() {
  return process.env.PROJECT_KICKOFF_HOME || join(homedir(), ".project-kickoff");
}

export function readStore(store) {
  const f = join(store, "lessons.jsonl");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
}

function readLedger(root) {
  const f = join(root, ".kickoff/HISTORY.jsonl");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
}

function parseMistakes(root, today) {
  const f = join(root, "STATE.md");
  if (!existsSync(f)) return [];
  const lines = readFileSync(f, "utf8").split(/\r?\n/);
  const start = lines.findIndex((l) => /^## Mistakes/.test(l));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) break;
    const bullet = lines[i].match(/^[-*]\s+(.*)/);
    if (!bullet) continue;
    let body = bullet[1].trim();
    if (/^\(none/i.test(body)) continue;
    let date = today;
    const dm = body.match(/^(\d{4}-\d{2}-\d{2})\s*[-—]?\s*(.*)/);
    if (dm) { date = dm[1]; body = dm[2].trim() || body; }
    out.push({ date, category: "process", what: body, evidence: "STATE.md", stage: "build-loop" });
  }
  return out;
}

function ledgerCandidates(rows, today, now) {
  const valid = rows.filter(isValidRow);
  const t = (r) => Date.parse(r.ts);
  const of = (e) => valid.filter((r) => r.event === e);
  const out = [];
  for (const r of of("blocker")) {
    const what = r.note ? `Work stopped on the owner: ${r.note}` : "Work stopped on the owner";
    out.push({ date: today, category: "process", what, evidence: ".kickoff/HISTORY.jsonl", stage: "build-loop" });
  }
  const closed = new Map(of("owner_action_done").map((r) => [r.id, r]));
  for (const r of of("owner_action_open")) {
    const end = closed.has(r.id) ? t(closed.get(r.id)) : now.getTime();
    const n = Math.round((end - t(r)) / DAY);
    if (n > 3) out.push({ date: today, category: "process", what: `Owner action ${r.id} stayed open ${n} days`, evidence: ".kickoff/HISTORY.jsonl", stage: "build-loop" });
  }
  const gates = of("gate_run");
  const bad = gates.filter((g) => g.failed > 0);
  if (bad.length >= 3) out.push({ date: today, category: "testing", what: `${bad.length} of ${gates.length} gate runs failed`, evidence: ".kickoff/HISTORY.jsonl", stage: "build-loop" });
  const reg = {};
  for (const r of of("regenerate")) reg[r.stage] = (reg[r.stage] || 0) + 1;
  for (const [st, n] of Object.entries(reg)) {
    if (n >= 2) {
      const name = STAGES[Number(st)] ?? String(st);
      out.push({ date: today, category: "process", what: `Stage ${name} was regenerated ${n} times`, evidence: ".kickoff/HISTORY.jsonl", stage: name });
    }
  }
  return out;
}

export function draftCandidates(root, { now = new Date() } = {}) {
  const today = isoDay(now);
  const raw = [...parseMistakes(root, today), ...ledgerCandidates(readLedger(root), today, now)];
  return raw.map((r, i) => ({ id: `new-${i + 1}`, ...r, rule: "(write the rule)", source: "this project", class: "CANDIDATE REUSABLE" }));
}

export function formatCandidates(rows) {
  const lines = ["# Lesson candidates", "", "Fill in each `rule`, delete rows that teach nothing, then run `retro.mjs <root> --save`.", "", HDR, "|---|---|---|---|---|---|---|---|---|"];
  for (const r of rows) lines.push(`| ${esc(r.id)} | ${esc(r.date)} | ${esc(r.category)} | ${esc(r.what)} | ${esc(r.evidence)} | ${esc(r.rule)} | ${esc(r.stage)} | ${esc(r.source)} | ${esc(r.class)} |`);
  return lines.join("\n") + "\n";
}

function splitCells(line) {
  const cells = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\" && line[i + 1] === "|") { cur += "|"; i++; continue; }
    if (line[i] === "|") { cells.push(cur.trim()); cur = ""; continue; }
    cur += line[i];
  }
  cells.push(cur.trim());
  return cells.slice(1, -1);
}

export function parseCandidates(text) {
  const lines = text.split(/\r?\n/);
  const hdr = lines.findIndex((l) => l.startsWith("| id |"));
  if (hdr < 0) return [];
  const rows = [];
  for (let i = hdr + 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("|")) break;
    const c = splitCells(line);
    if (c.length < 9) continue;
    rows.push({ id: unesc(c[0]), date: unesc(c[1]), category: unesc(c[2]), what: unesc(c[3]), evidence: unesc(c[4]), rule: unesc(c[5]), stage: unesc(c[6]), source: unesc(c[7]), class: unesc(c[8]) });
  }
  return rows;
}

export function saveLessons(root, store) {
  const candF = join(root, ".kickoff/lessons-candidates.md");
  if (!existsSync(candF)) throw new Error("missing .kickoff/lessons-candidates.md");
  const rows = parseCandidates(readFileSync(candF, "utf8"));
  // Created on first save when missing, so two projects never share one identity in the store.
  const pid = projectId(root);
  const dup = new Set(readStore(store).filter((r) => r.project_id === pid).map((r) => r.what));
  mkdirSync(store, { recursive: true });
  const f = join(store, "lessons.jsonl");
  let saved = 0, skipped = 0, duplicate = 0;
  const savedAt = new Date().toISOString();
  for (const r of rows) {
    if (!r.rule || r.rule === "(write the rule)") { skipped++; continue; }
    if (dup.has(r.what)) { duplicate++; continue; }
    dup.add(r.what);
    appendFileSync(f, JSON.stringify({ v: 1, saved: savedAt, project_id: pid, date: r.date, category: r.category, what: r.what, evidence: r.evidence, rule: r.rule, stage: r.stage, class: r.class }) + "\n");
    saved++;
  }
  return { saved, skipped, duplicate };
}

// Read-only. Returns why the draft must not be written, or null when it is safe.
export function draftTrackedReason(root, git = "git") {
  const r = spawnSync(git, ["ls-files", "--error-unmatch", "--", ".kickoff/lessons-candidates.md"], { cwd: root, encoding: "utf8" });
  if (r.status === 0) return "git tracks .kickoff/lessons-candidates.md, so it would be published; run: git rm --cached .kickoff/lessons-candidates.md, then retro again";
  if (r.status === 1) return null; // a repo, file not tracked
  // Anything else (no git, no access, "not a git repository" from a broken GIT_DIR) is safe only when no
  // .git exists at or above the project.
  for (let d = resolve(root); ; d = dirname(d)) {
    if (existsSync(join(d, ".git"))) return "cannot check whether git tracks .kickoff/lessons-candidates.md (" + (r.error ? r.error.code : (r.stderr || "").trim().split("\n")[0]) + "); fix git access, then retro again";
    if (dirname(d) === d) return null; // no repo above: nothing to publish
  }
}

const USAGE = "usage: retro.mjs <project-root> [--force|--save] | retro.mjs --list";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--list")) {
    listLessons(storeDir());
    process.exit(0);
  }
  const root = resolve(args.find((a) => !a.startsWith("--")) ?? "");
  if (!root || args.length === 0) { console.error(USAGE); process.exit(1); }
  if (args.includes("--save")) {
    try {
      const { saved, skipped, duplicate } = saveLessons(root, storeDir());
      console.log(`saved ${saved}, skipped ${skipped} (no rule), ${duplicate} already saved`);
    } catch (e) { console.error(e.message); process.exit(1); }
    process.exit(0);
  }
  const outF = join(root, ".kickoff/lessons-candidates.md");
  if (existsSync(outF) && !args.includes("--force")) { console.error(`${outF} exists; use --force`); process.exit(1); }
  // The draft may hold project details; it must never reach git. An ignore rule does not untrack a file,
  // so refuse when git tracks or stages it, and when that cannot be checked inside a repo.
  const why = draftTrackedReason(root);
  if (why) { console.error(why); process.exit(1); }
  const rows = draftCandidates(root);
  mkdirSync(join(root, ".kickoff"), { recursive: true });
  const ignoreF = join(root, ".kickoff/.gitignore");
  const ignore = existsSync(ignoreF) ? readFileSync(ignoreF, "utf8") : "";
  if (!/^lessons-candidates\.md$/m.test(ignore)) appendFileSync(ignoreF, (ignore && !ignore.endsWith("\n") ? "\n" : "") + "lessons-candidates.md\n");
  writeFileSync(outF, formatCandidates(rows));
  if (!rows.length) console.log("no candidates found");
  console.log(`${rows.length} candidates -> .kickoff/lessons-candidates.md`);
}

function listLessons(store) {
  const rows = readStore(store).sort((a, b) => (a.saved || "").localeCompare(b.saved || ""));
  if (!rows.length) { console.log("no saved lessons"); return; }
  // project = the first 8 characters of the random project id: tells two projects apart, names nothing.
  console.log("| date | project | category | what happened | rule | stage | class |");
  console.log("|---|---|---|---|---|---|---|");
  for (const r of rows) console.log(`| ${esc(r.date)} | ${esc(String(r.project_id ?? "unknown").slice(0, 8))} | ${esc(r.category)} | ${esc(r.what)} | ${esc(r.rule)} | ${esc(r.stage)} | ${esc(r.class)} |`);
}
