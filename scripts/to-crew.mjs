#!/usr/bin/env node
// Exports a feature's kickoff tickets (.tickets/<feature>-<n>.md) as a Crew DAG (crew.json).
// No code dependency on Crew: the JSON format is the contract, so this checks what Crew refuses
// at load. An existing crew.json keeps its frame; only `tickets` is merged.
// Usage: node scripts/to-crew.mjs <project-root> --feature <name> [--base <branch>] [--out <file>]
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENGINES = ["codex", "cursor", "claude", "agy"];
const REQUIRED = ["id", "engine", "model", "write_set", "accept"];
const OPTIONAL = ["blocked_by", "skills"];
const BRIEF_CAP = 8000;
const CONSTRAINTS = /^## CONSTRAINTS\s*$/m;
const list = (v) => v.split(",").map((s) => s.trim()).filter(Boolean);

export function parseTicket(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0].trim() !== "---") throw new Error("missing front matter: first line must be ---");
  const end = lines.indexOf("---", 1);
  if (end < 0) throw new Error("front matter not closed with ---");
  const raw = {};
  for (const line of lines.slice(1, end)) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf(":");
    if (i < 0) throw new Error(`bad front-matter line: ${l}`);
    const key = l.slice(0, i).trim();
    const value = l.slice(i + 1).trim();
    if (!REQUIRED.includes(key) && !OPTIONAL.includes(key)) throw new Error(`unknown front-matter key: ${key}`);
    if (key === "accept") (raw.accept ||= []).push(value);
    else if (key in raw) throw new Error(`repeated front-matter key: ${key}`);
    else raw[key] = value;
  }
  for (const key of REQUIRED) if (!(key in raw)) throw new Error(`missing front-matter key: ${key}`);
  const t = {
    id: raw.id,
    engine: raw.engine,
    model: raw.model,
    write_set: list(raw.write_set),
    accept: raw.accept.filter(Boolean),
    blocked_by: list(raw.blocked_by || ""),
  };
  if (raw.skills !== undefined) t.skills = list(raw.skills);
  return t;
}

export function readGates(root) {
  const file = join(root, "docs", "KICKOFF.md");
  if (!existsSync(file)) return [];
  const block = readFileSync(file, "utf8").match(/```gates\r?\n([\s\S]*?)```/);
  if (!block) return [];
  return block[1].split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
}

const nonEmptyList = (v) => Array.isArray(v) && v.length > 0;

export function checkDag(dag, root) {
  const errors = [];
  if (dag?.schema_version !== 1) errors.push("schema_version must be 1");
  if (!dag?.repo) errors.push("repo is empty");
  if (!dag?.slug) errors.push("slug is empty");
  if (!nonEmptyList(dag?.validate)) errors.push("validate is empty (add commands to the ```gates block of docs/KICKOFF.md)");
  if (!nonEmptyList(dag?.tickets)) return [...errors, "tickets is empty"];
  const ids = new Set();
  for (const t of dag.tickets) {
    const who = `ticket ${t.id}`;
    if (!t.id) errors.push("ticket without id");
    else if (ids.has(t.id)) errors.push(`duplicate id: ${t.id}`);
    ids.add(t.id);
    if (!ENGINES.includes(t.engine)) errors.push(`${who}: engine must be one of ${ENGINES.join(", ")}, got ${t.engine}`);
    if (!t.model) errors.push(`${who}: model is empty`);
    if (!nonEmptyList(t.write_set)) errors.push(`${who}: write_set is empty`);
    if (!nonEmptyList(t.accept)) errors.push(`${who}: accept is empty`);
    const brief = t.brief_path && resolve(root, t.brief_path);
    if (!brief || !existsSync(brief)) errors.push(`${who}: brief file missing: ${t.brief_path}`);
    else {
      const text = readFileSync(brief, "utf8");
      if (text.length > BRIEF_CAP) errors.push(`${who}: brief is ${text.length} chars, over ${BRIEF_CAP}`);
      if (!CONSTRAINTS.test(text)) errors.push(`${who}: brief has no ## CONSTRAINTS heading`);
    }
  }
  const deps = new Map(dag.tickets.map((t) => [t.id, t.blocked_by || []]));
  for (const [id, by] of deps) for (const b of by) if (!deps.has(b)) errors.push(`ticket ${id}: blocked_by unknown id: ${b}`);
  // Cycle check: depth-first, a node met again while still on the path closes a cycle.
  const state = new Map();
  const visit = (id, path) => {
    state.set(id, "open");
    for (const b of deps.get(id) || []) {
      if (!deps.has(b)) continue;
      if (state.get(b) === "open") errors.push(`cycle in blocked_by: ${[...path.slice(path.indexOf(b)), b].join(" -> ")}`);
      else if (!state.has(b)) visit(b, [...path, b]);
    }
    state.set(id, "done");
  };
  for (const id of deps.keys()) if (!state.has(id)) visit(id, [id]);
  return errors;
}

function build(root, feature, { base, existing } = {}) {
  root = resolve(root);
  const dir = join(root, ".tickets");
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.startsWith(`${feature}-`) && /^\d+\.md$/.test(f.slice(feature.length + 1)))
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    : [];
  if (!files.length) throw new Error(`no tickets: .tickets/${feature}-*.md`);
  const problems = [];
  const tickets = [];
  for (const f of files) {
    try {
      const { id, engine, model, write_set, accept, blocked_by, skills } = parseTicket(readFileSync(join(dir, f), "utf8"));
      const t = { id, engine, model, brief_path: `.tickets/${f}`, write_set, accept, blocked_by };
      if (skills) t.skills = skills;
      if (tickets.some((x) => x.id === id)) throw new Error(`duplicate id: ${id}`);
      tickets.push(t);
    } catch (e) {
      problems.push(`.tickets/${f}: ${e.message}`);
    }
  }
  if (problems.length) throw new Error(problems.join("\n"));

  let dag;
  if (existing) {
    dag = { ...existing, tickets: [...(existing.tickets || [])] };
  } else {
    const branch = base || execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    dag = { schema_version: 1, repo: root, slug: feature, base_branch: branch, validate: [], tickets: [] };
  }
  // Checked on the final DAG: an existing crew.json keeps its own base_branch, so it is checked too.
  if (["main", "master", "HEAD"].includes(dag.base_branch))
    throw new Error(`base branch must be a feature branch, not ${dag.base_branch}; create one first (git switch -c feature/${feature})` +
      (existing ? " and set base_branch in crew.json to it" : ""));
  if (!nonEmptyList(dag.validate)) {
    dag.validate = readGates(root);
    if (!dag.validate.length) throw new Error("no commands in a ```gates block of docs/KICKOFF.md (Crew refuses an empty validate)");
  }
  let added = 0, replaced = 0;
  for (const t of tickets) {
    const i = dag.tickets.findIndex((x) => x.id === t.id);
    if (i < 0) { dag.tickets.push(t); added++; }
    else { dag.tickets[i] = t; replaced++; }
  }
  return { dag, added, replaced };
}

export function buildDag(root, feature, opts = {}) {
  return build(root, feature, opts).dag;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const usage = "usage: node scripts/to-crew.mjs <project-root> --feature <name> [--base <branch>] [--out <file>]";
  const args = process.argv.slice(2);
  const opts = {};
  let rootArg;
  for (let i = 0; i < args.length; i++) {
    const m = args[i].match(/^--(feature|base|out)$/);
    if (m && args[i + 1] && !args[i + 1].startsWith("--")) opts[m[1]] = args[++i];
    else if (!m && !rootArg && !args[i].startsWith("--")) rootArg = args[i];
    else { console.error(usage); process.exit(1); }
  }
  if (!rootArg || !opts.feature) { console.error(usage); process.exit(1); }
  const root = resolve(rootArg);
  const out = opts.out ? resolve(opts.out) : join(root, "crew.json");
  try {
    const existing = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : undefined;
    const { dag, added, replaced } = build(root, opts.feature, { base: opts.base, existing });
    const errors = checkDag(dag, root);
    if (errors.length) throw new Error(errors.join("\n"));
    writeFileSync(out, JSON.stringify(dag, null, 2) + "\n");
    console.log(`crew.json: ${dag.tickets.length} tickets (${added} added, ${replaced} replaced) -> ${out}`);
  } catch (e) {
    for (const line of e.message.split("\n")) console.error(line);
    process.exit(1);
  }
}
