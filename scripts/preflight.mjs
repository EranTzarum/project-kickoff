#!/usr/bin/env node
// Advisory kickoff checker. node preflight.mjs [project-root] [--strict]
// Reads docs/KICKOFF.md (## Stage N — Name headings, table rows with a `path` in the second column),
// checks each deliverable exists, is non-empty and has no {{PLACEHOLDER}} left, then runs cross-checks:
//   env:        keys in .env.example ⊆ keys in docs/ENV_MATRIX.md and vice versa
//   migrations: every created table has RLS enabled; every created function has a revoke from anon;
//               no two migration files share a prefix
//   env-tiers:  real-user databases must not be shared with disposable tiers; no tier is both
//   line-endings: shell scripts must be LF; .gitattributes must pin *.sh eol=lf when .sh files exist
// Prints one line per stage and per failed cross-check. Exit 0 always, except --strict with any
// MISSING/CHECK line → exit 1 (for CI). CRLF-tolerant. No dependencies.
import { readFileSync, existsSync, statSync, lstatSync, readdirSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const root = resolve(args.find((a) => !a.startsWith("--")) ?? ".");
const read = (p) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");

const kickoff = join(root, "docs/KICKOFF.md");
if (!existsSync(kickoff)) {
  const markers = [
    "package.json", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml",
    "composer.json", "Gemfile", "pom.xml", "build.gradle", "manifest.json",
  ];
  const found = markers.find((m) => existsSync(join(root, m)))
    ?? (existsSync(join(root, "src")) ? "src/" : existsSync(join(root, "app")) ? "app/" : null);
  if (found) {
    console.log(`STAGE 0 INTAKE: MISSING — docs/KICKOFF.md (existing project detected: ${found}; run /project-kickoff adopt)`);
  } else {
    console.log("STAGE 0 INTAKE: MISSING — docs/KICKOFF.md (run /project-kickoff to generate it)");
  }
  process.exit(strict ? 1 : 0);
}

// ---- parse the manifest ----
const stages = [];
let current = null;
for (const line of read("docs/KICKOFF.md").split("\n")) {
  const h = line.match(/^##\s+Stage\s+(\d+)\s+[—-]+\s+(.+?)\s*$/);
  if (h) { current = { n: Number(h[1]), name: h[2], paths: [] }; stages.push(current); continue; }
  if (line.startsWith("## ")) { current = null; continue; }
  const row = current && line.match(/^\|[^|]*\|\s*`([^`]+)`\s*\|/);
  if (row) current.paths.push(row[1]);
}

// ---- per-deliverable checks ----
let problems = 0;
const ready = [];
for (const s of stages) {
  const missing = [];
  for (const p of s.paths) {
    const full = join(root, p);
    if (!existsSync(full)) { missing.push(`${p} (absent)`); continue; }
    if (statSync(full).size === 0) { missing.push(`${p} (empty)`); continue; }
    const left = read(p).match(/\{\{[A-Z0-9_]+\}\}/g);
    if (left) missing.push(`${p} (placeholder ${[...new Set(left)].slice(0, 3).join(" ")} left)`);
  }
  const label = `STAGE ${s.n} ${s.name.toUpperCase().replace(/\s*\(.*\)\s*$/, "")}`;
  if (s.paths.length === 0) { console.log(`${label}: (no tracked deliverables)`); continue; }
  if (missing.length) { problems++; console.log(`${label}: MISSING — ${missing.join("; ")}`); }
  else { console.log(`${label}: READY`); ready.push(s.n); }
}

// ---- strict: the manifest must be complete ----
if (strict) {
  const names = ["INTAKE", "DOMAIN", "ARCHITECTURE", "DATABASE", "AUTH & ENVIRONMENTS", "WORKSPACE & HARNESS"];
  for (let n = 0; n <= 5; n++) {
    const s = stages.find((x) => x.n === n);
    if (!s) { problems++; console.log(`STAGE ${n} ${names[n]}: MISSING — stage absent from docs/KICKOFF.md`); }
    else if (s.paths.length === 0) { problems++; console.log(`STAGE ${n} ${names[n]}: MISSING — no deliverables listed`); }
  }
  const gates = read("docs/KICKOFF.md").match(/```gates\n([\s\S]*?)```/)?.[1] ?? "";
  if (!gates.split("\n").some((l) => l.trim() && !l.trim().startsWith("#"))) { problems++; console.log("CHECK gates: docs/KICKOFF.md has no gate commands"); }
}

// ---- cross-check: env keys ----
// An adopted repo may keep these under other names (.kickoff/adopt.json -> mapped); check the real files.
let adoptMap = {};
try { adoptMap = JSON.parse(read(".kickoff/adopt.json")).mapped ?? {}; } catch { adoptMap = {}; }
const envExample = typeof adoptMap[".env.example"] === "string" ? adoptMap[".env.example"] : ".env.example";
const envMatrix = typeof adoptMap["docs/ENV_MATRIX.md"] === "string" ? adoptMap["docs/ENV_MATRIX.md"] : "docs/ENV_MATRIX.md";
if (existsSync(join(root, envExample)) && existsSync(join(root, envMatrix))) {
  const exampleKeys = new Set(read(envExample).split("\n").map((l) => l.match(/^([A-Z][A-Z0-9_]*)=/)?.[1]).filter(Boolean));
  // Env keys live above the tiers table; a tier named in capitals ("CI", "QA") is not a key.
  const matrixText = read(envMatrix).split("\n## Environment tiers")[0];
  const matrixKeys = new Set([...matrixText.matchAll(/^\|\s*([A-Z][A-Z0-9_]*)\s*\|/gm)].map((m) => m[1]).filter((k) => k !== "KEY"));
  for (const k of exampleKeys) if (!matrixKeys.has(k)) { problems++; console.log(`CHECK env: ${envExample} key ${k} not in ${envMatrix}`); }
  for (const k of matrixKeys) if (!exampleKeys.has(k)) { problems++; console.log(`CHECK env: ${envMatrix} key ${k} not in ${envExample}`); }
}

// ---- cross-check: migrations ----
const migDir = join(root, "supabase/migrations");
if (existsSync(migDir)) {
  const files = readdirSync(migDir).filter((f) => f.endsWith(".sql") && !f.startsWith("_"));
  const seen = new Map();
  for (const f of files) {
    const prefix = f.match(/^(\d{4,14})[_-]/)?.[1];
    if (prefix) { if (seen.has(prefix)) { problems++; console.log(`CHECK migrations: prefix ${prefix} used by ${seen.get(prefix)} and ${f}`); } else seen.set(prefix, f); }
    const sql = read(`supabase/migrations/${f}`).toLowerCase().replace(/--[^\n]*/g, "");
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/g)) {
      const t = m[1];
      if (!new RegExp(`alter\\s+table\\s+(?:public\\.)?"?${t}"?\\s+enable\\s+row\\s+level\\s+security`).test(sql)) { problems++; console.log(`CHECK migrations: ${f} creates table ${t} without enabling RLS`); }
    }
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/g)) {
      const fn = m[1];
      if (!new RegExp(`revoke\\s+(?:execute|all)\\s+on\\s+function\\s+(?:public\\.)?"?${fn}"?[^;]*\\bfrom\\b[^;]*\\b(anon|public)\\b`).test(sql)) { problems++; console.log(`CHECK migrations: ${f} creates function ${fn}() without a revoke from anon/public`); }
    }
  }
}

// ---- cross-check: environment tiers (docs/ENV_MATRIX.md or adopt-mapped path) ----
const skipDb = new Set(["-", "local", "none", "n/a", ""]);
const yes = (v) => v === "yes";
if (existsSync(join(root, envMatrix))) {
  const norm = read(envMatrix);
  const sec = norm.indexOf("## Environment tiers");
  if (sec >= 0) {
    const tiers = [];
    for (const line of norm.slice(sec).split("\n")) {
      if (line.startsWith("## ") && tiers.length) break;
      if (!line.startsWith("|")) continue;
      // Split on unescaped pipes only; render.mjs writes a | inside a value as \|.
      const cells = line.trim().slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
      if (!cells[0] || cells[0] === "Tier" || /^-+$/.test(cells[0])) continue;
      if (cells.length < 8) continue;
      tiers.push({ name: cells[0], db: cells[3], real: cells[6], disp: cells[7] });
    }
    if (tiers.length) {
      for (const t of tiers) {
        if (yes(t.real) && yes(t.disp)) {
          problems++;
          console.log(`CHECK env-tiers: tier ${t.name} is marked both real users and disposable`);
        }
      }
      const byDb = new Map();
      for (const t of tiers) {
        if (skipDb.has(t.db)) continue;
        if (!byDb.has(t.db)) byDb.set(t.db, []);
        byDb.get(t.db).push(t);
      }
      for (const [db, group] of byDb) {
        const real = group.filter((t) => yes(t.real));
        const disp = group.filter((t) => yes(t.disp));
        for (const r of real) {
          for (const d of disp) {
            if (r.name === d.name) continue;
            problems++;
            console.log(`CHECK env-tiers: database ${db} holds real users (${r.name}) and is shared with disposable tier ${d.name}`);
          }
        }
      }
    }
  }
}

// ---- cross-check: shell line endings ----
const readRaw = (p) => readFileSync(join(root, p), "utf8");
const shellScripts = [];
// An unreadable folder or a broken link is skipped: the checker stays advisory and never crashes.
const walkSh = (dir) => {
  let entries = [];
  try { entries = readdirSync(join(root, dir)); } catch { return; }
  for (const e of entries) {
    if (e === "node_modules" || e === ".git") continue;
    const rel = dir === "." ? e : `${dir}/${e}`;
    const full = join(root, rel);
    // No depth limit; symlinked folders are not followed, so a link cycle cannot loop.
    let isDir = false, isFile = false;
    try { const st = lstatSync(full); isDir = st.isDirectory(); isFile = st.isFile(); } catch { continue; }
    if (isDir) {
      walkSh(rel);
    } else if (isFile && (e.endsWith(".sh") || e.endsWith(".bash"))) {
      shellScripts.push(rel);
      let text = "";
      try { text = readRaw(rel); } catch { continue; }
      if (text.includes("\r\n")) {
        problems++;
        console.log(`CHECK line-endings: ${rel} has CRLF line endings; it fails on Linux`);
      }
    }
  }
};
walkSh(".");
if (shellScripts.length) {
  const ga = join(root, ".gitattributes");
  const gaText = existsSync(ga) ? readRaw(".gitattributes").replace(/\r\n/g, "\n") : "";
  if (!/^\*\.sh\s+.*eol=lf/m.test(gaText)) {
    problems++;
    console.log("CHECK line-endings: .gitattributes has no \"*.sh text eol=lf\" rule");
  }
}

// ---- ledger: the first time a stage turns READY, append a stage_ready row (schema: the skill's
// docs/METRICS.md). Self-contained on purpose: this file is copied into projects without the skill.
// Only once the project has .kickoff/project.json, and never in CI.
const ledger = join(root, ".kickoff/HISTORY.jsonl");
const idFile = join(root, ".kickoff/project.json");
// Best effort: a ledger problem prints a NOTE and never changes the exit code.
if (!process.env.CI && existsSync(idFile)) {
  try {
    const rows = existsSync(ledger) ? read(".kickoff/HISTORY.jsonl").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } }) : [];
    const done = new Set(rows.filter((r) => r.event === "stage_ready").map((r) => r.stage));
    const project_id = JSON.parse(read(".kickoff/project.json")).project_id;
    for (const n of ready.filter((n) => !done.has(n))) {
      appendFileSync(ledger, JSON.stringify({ v: 1, ts: new Date().toISOString(), project_id, event: "stage_ready", stage: n }) + "\n");
    }
  } catch (e) {
    console.log(`NOTE ledger: not recorded (${e.message})`);
  }
}

if (strict && problems) process.exit(1);
