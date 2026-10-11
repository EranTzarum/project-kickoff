#!/usr/bin/env node
// Advisory kickoff checker. node preflight.mjs [project-root] [--strict]
// Reads docs/KICKOFF.md (## Stage N — Name headings, table rows with a `path` in the second column),
// checks each deliverable exists, is non-empty and has no {{PLACEHOLDER}} left, then runs cross-checks:
//   env:        keys in .env.example ⊆ keys in docs/ENV_MATRIX.md and vice versa
//   migrations: every created table has RLS enabled; every created function has a revoke from anon;
//               no two migration files share a prefix
// Prints one line per stage and per failed cross-check. Exit 0 always, except --strict with any
// MISSING/CHECK line → exit 1 (for CI). CRLF-tolerant. No dependencies.
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const root = resolve(args.find((a) => !a.startsWith("--")) ?? ".");
const read = (p) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");

const kickoff = join(root, "docs/KICKOFF.md");
if (!existsSync(kickoff)) {
  console.log("STAGE 0 INTAKE: MISSING — docs/KICKOFF.md (run /project-kickoff to generate it)");
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
  else console.log(`${label}: READY`);
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
if (existsSync(join(root, ".env.example")) && existsSync(join(root, "docs/ENV_MATRIX.md"))) {
  const exampleKeys = new Set(read(".env.example").split("\n").map((l) => l.match(/^([A-Z][A-Z0-9_]*)=/)?.[1]).filter(Boolean));
  const matrixKeys = new Set([...read("docs/ENV_MATRIX.md").matchAll(/^\|\s*([A-Z][A-Z0-9_]*)\s*\|/gm)].map((m) => m[1]).filter((k) => k !== "KEY"));
  for (const k of exampleKeys) if (!matrixKeys.has(k)) { problems++; console.log(`CHECK env: .env.example key ${k} not in docs/ENV_MATRIX.md`); }
  for (const k of matrixKeys) if (!exampleKeys.has(k)) { problems++; console.log(`CHECK env: docs/ENV_MATRIX.md key ${k} not in .env.example`); }
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

if (strict && problems) process.exit(1);
