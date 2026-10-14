#!/usr/bin/env node
// Adopt an existing repository: map its documents onto kickoff's deliverables, report gaps by risk.
//   node adopt.mjs <project-root> [--write] [--force]
// Dry run by default. --write creates only docs/KICKOFF.md and .kickoff/adopt.json (plus the ledger
// event); it never touches an existing document. Gaps never change the exit code.
import { readFileSync, writeFileSync, existsSync, statSync, lstatSync, readdirSync, mkdirSync } from "node:fs";
import { join, resolve, basename, dirname, posix } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { logEvent } from "./log.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const write = args.includes("--write");
const force = args.includes("--force");
const rootArg = args.find((a) => !a.startsWith("--"));
if (!rootArg || !existsSync(rootArg) || !statSync(rootArg).isDirectory()) {
  console.error("usage: adopt.mjs <project-root> [--write] [--force]");
  process.exit(1);
}
const root = resolve(rootArg);
const readOr = (p, d = "") => { try { return readFileSync(join(root, p), "utf8"); } catch { return d; } };
const isDir = (p) => { try { return statSync(join(root, p)).isDirectory(); } catch { return false; } };
const ls = (p) => { try { return readdirSync(join(root, p)); } catch { return []; } };

// Real on-disk path of rel, or null. ci: match the file name case-insensitively.
function find(rel, ci) {
  const dir = posix.dirname(rel), base = posix.basename(rel).toLowerCase();
  const hit = ls(dir).find((n) => (ci ? n.toLowerCase() === base : n === posix.basename(rel)));
  if (!hit) return null;
  const real = dir === "." ? hit : `${dir}/${hit}`;
  return statSync(join(root, real)).isFile() ? real : null;
}

// ---- stack / profile ----
let pkg = {};
try { pkg = JSON.parse(readOr("package.json", "{}")); } catch { pkg = {}; }
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const py = (readOr("pyproject.toml") + "\n" + readOr("requirements.txt")).toLowerCase();
const stack = [];
const add = (s) => { if (!stack.includes(s)) stack.push(s); };
for (const [d, s] of [["next", "nextjs"], ["react", "react"], ["vite", "vite"], ["@supabase/supabase-js", "supabase"], ["express", "express"]]) {
  if (Object.hasOwn(deps, d)) add(s);
}
if (py.includes("fastapi")) add("fastapi");
if (py.includes("django")) add("django");
if (isDir("supabase")) add("supabase");
const mv3 = (p) => /"manifest_version"\s*:\s*3\b/.test(readOr(p));
if (mv3("manifest.json") || ls(".").some((d) => d !== "node_modules" && d !== ".git" && isDir(d) && mv3(`${d}/manifest.json`))) add("mv3-extension");
if (["Caddyfile", "docker-compose.yml", "docker-compose.yaml", "compose.yaml"].some((f) => find(f, false))) add("single-vm");
const hasSupabase = stack.includes("supabase");
const profile = ["react", "vite", "supabase"].every((s) => stack.includes(s)) ? "supabase-react-vercel" : "none (no matching stack profile yet)";

// ---- gates ----
const gaps = [];
const gap = (risk, id, text) => gaps.push({ risk, id, text });
let gates = ["typecheck", "lint", "test", "build"].filter((n) => pkg.scripts && Object.hasOwn(pkg.scripts, n)).map((n) => `npm run ${n}`);
if (!gates.length && py.includes("pytest")) gates = ["python -m pytest"];
if (!gates.length) {
  gates = ["# add your gate commands here"];
  gap("high", "no-gates", "no gate commands found (typecheck, test, build); preflight --strict fails until you add them");
}

// ---- mapping ----
const workflows = ls(".github/workflows").filter((f) => /\.ya?ml$/i.test(f)).sort();
const ALIASES = {
  "docs/DOMAIN.md": ["DOMAIN.md", "docs/domain.md", "docs/DOMAIN_MODEL.md", "docs/domain-model.md", "docs/data-model.md"],
  "docs/ARCHITECTURE.md": ["ARCHITECTURE.md", "docs/architecture.md", "docs/design.md"],
  "docs/ENV_MATRIX.md": ["docs/ENVIRONMENTS.md", "docs/environments.md", "docs/env.md"],
  "docs/MIGRATION_RUNBOOK.md": ["docs/MIGRATIONS.md", "docs/migrations.md", "docs/RUNBOOK.md"],
  "STATE.md": ["docs/STATE.md", "PROGRESS.md", "docs/STATUS.md"],
  "AGENTS.md": ["CLAUDE.md"],
  ".env.example": [".env.sample", ".env.template", ".env.dist"],
  ".github/workflows/gates.yml": workflows.slice(0, 1).map((f) => `.github/workflows/${f}`),
};
// Env template names: keys only, safe to commit. Same set as the env alias list and the env guard hook.
const ENV_TEMPLATES = [".env.example", ".env.sample", ".env.template", ".env.dist"];
const SUPABASE_ROWS = ["supabase/migrations/_TEMPLATE.sql", "supabase/migrations/00000000000000_auth_hook.sql",
  "scripts/db-types.mjs", ".claude/agents/rls-auditor.md"];
// service-role-guard.js stays: .claude/settings.json wires it in, and it only warns.

const tplPath = join(here, "../templates/docs/KICKOFF.md");
const tpl = readFileSync(tplPath, "utf8");
const eol = tpl.includes("\r\n") ? "\r\n" : "\n";
const ROW = /^(\|[^|]*\|\s*`)([^`]+)(`\s*\|.*)$/;
const present = [], mapped = {}, excluded = [], out = [];
for (const line of tpl.split(/\r?\n/)) {
  const m = line.match(ROW);
  if (!m) { out.push(line); continue; }
  const p = m[2];
  if (p === "docs/KICKOFF.md") { out.push(line); if (find(p, false)) present.push(p); continue; }
  if (!hasSupabase && SUPABASE_ROWS.includes(p)) { excluded.push(p); continue; }
  // Exact path first, then aliases and the path itself case-insensitively; one entry per real file.
  const hits = [];
  for (const real of [find(p, false), ...(ALIASES[p] ?? []).map((a) => find(a, true)), find(p, true)]) {
    if (real && !hits.includes(real)) hits.push(real);
  }
  if (!hits.length) { out.push(line); gap("low", `missing-${p}`, `${p} missing`); continue; }
  const chosen = hits[0];
  if (chosen === p) { present.push(p); out.push(line); }
  else { mapped[p] = chosen; out.push(m[1] + chosen + m[3]); }
  // Several workflow files are normal; only real document duplicates are a conflict.
  if (hits.length > 1 && !p.startsWith(".github/workflows/")) {
    gap("medium", `conflict-${p}`, `${hits[0]} and ${hits[1]} both look like ${p}; kickoff uses ${chosen}, merge or delete the other`);
  }
  if (p === "AGENTS.md" && chosen.toLowerCase() === "claude.md") {
    gap("medium", "rules-claude-only", "rules live in CLAUDE.md; lesson L100: make AGENTS.md the only instruction file");
  }
}

// ---- other gaps ----
try {
  const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  for (const f of files.split(/\r?\n/).filter(Boolean)) {
    const b = posix.basename(f);
    if (/^\.env(\..+)?$/.test(b) && !ENV_TEMPLATES.includes(b)) {
      gap("high", "env-tracked", `real env file ${f} is committed; remove it from git and rotate its keys`);
    }
  }
} catch { /* not a git repo or no git: skip */ }
if (!workflows.length) gap("high", "no-ci", "no CI workflow; gates only run on someone's machine");
// No depth limit; symlinked folders are not followed (lstat), so a link cycle cannot loop.
const isRealDir = (p) => { try { return lstatSync(join(root, p)).isDirectory(); } catch { return false; } };
const walk = (dir) => {
  for (const e of ls(dir)) {
    if (e === "node_modules" || e === ".git") continue;
    const rel = dir === "." ? e : `${dir}/${e}`;
    if (isRealDir(rel)) { walk(rel); }
    else if (e.endsWith(".sh") && readOr(rel).includes("\r\n")) {
      gap("high", "crlf-sh", `${rel} has CRLF line endings; it fails on Linux (set: pipefail: invalid option)`);
    }
  }
};
walk(".");
if (!find("AGENTS.md", true) && !find("CLAUDE.md", true)) gap("medium", "no-rules", "no agent rules file");
if (![...present, ...Object.keys(mapped)].includes("STATE.md")) gap("medium", "no-state", "no living state file; agents cannot resume");

const order = { high: 0, medium: 1, low: 2 };
const sorted = gaps.map((g, i) => [g, i]).sort((a, b) => order[a[0].risk] - order[b[0].risk] || a[1] - b[1]).map(([g]) => g);

// ---- report ----
console.log(`STACK: ${stack.length ? stack.join(", ") : "none detected"}`);
console.log(`PROFILE: ${profile}`);
for (const p of present) console.log(`PRESENT ${p}`);
for (const [p, real] of Object.entries(mapped)) console.log(`MAP ${p} -> ${real}`);
for (const g of sorted) console.log(`GAP ${g.risk}: ${g.text}`);

if (!write) {
  console.log("dry run: nothing written; re-run with --write");
  process.exit(0);
}
if (existsSync(join(root, "docs/KICKOFF.md")) && !force) {
  console.error("docs/KICKOFF.md exists; pass --force to replace it");
  process.exit(1);
}
const name = typeof pkg.name === "string" && pkg.name.trim() ? pkg.name : basename(root);
const date = new Date().toISOString().slice(0, 10);
const manifest = out.join(eol)
  .replaceAll("{{PROJECT_NAME}}", name).replaceAll("{{DATE}}", date)
  .replaceAll("{{STACK_PROFILE}}", profile).replaceAll("{{GATES}}", gates.join(eol));
mkdirSync(join(root, "docs"), { recursive: true });
writeFileSync(join(root, "docs/KICKOFF.md"), manifest);
mkdirSync(join(root, ".kickoff"), { recursive: true });
writeFileSync(join(root, ".kickoff/adopt.json"), JSON.stringify({ v: 1, mapped, excluded, stack, profile, gaps: sorted }, null, 2) + "\n");
console.log("WROTE docs/KICKOFF.md, .kickoff/adopt.json");
try { logEvent(root, "adopt", { mapped: Object.keys(mapped).length, gaps: sorted.length }); }
catch (e) { console.log(`NOTE ledger: ${e.message}`); }
