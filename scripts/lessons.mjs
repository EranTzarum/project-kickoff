#!/usr/bin/env node
// Lessons table reader and lint for references/lessons.md. Every lesson row carries a source project
// (declared under `## Sources`) and a class; a rule is CONFIRMED REUSABLE only with two or more sources.
//   node lessons.mjs --lint [root]   (root defaults to the repo root)
// Cited ids come from <root>/references/stages.md and <root>/SKILL.md; each must have a row.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FIELDS = ["id", "date", "category", "what", "evidence", "rule", "stage", "source", "class"];
export const STAGES = ["intake", "domain", "architecture", "db", "auth-env", "workspace", "build-loop"];
export const CLASSES = ["PROJECT-SPECIFIC", "CANDIDATE REUSABLE", "CONFIRMED REUSABLE"];

// Cells of a `| a | b |` row, split on pipes not escaped as `\|`.
const cells = (line) => line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim());

// Any row whose first cell starts with L, so a malformed id (L1O9) is linted, not skipped.
const lessonRows = (text) =>
  text.split(/\r?\n/).filter((l) => /^\|\s*L[^|\s]*\s*\|/.test(l)).map(cells);

export function parseLessons(text) {
  return lessonRows(text).map((c) => Object.fromEntries(FIELDS.map((f, i) => [f, c[i] ?? ""])));
}

export function declaredSources(text) {
  const m = text.match(/^## Sources\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!m) return [];
  return [...m[1].matchAll(/^- `([^`]+)` — /gm)].map((x) => x[1]);
}

const isDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export function lintLessons(text, { cited = [] } = {}) {
  const errors = [];
  const declared = new Set(declaredSources(text));
  const seen = new Set();
  for (const row of lessonRows(text)) {
    const id = row[0];
    if (!/^L\d+$/.test(id)) { errors.push(`${id}: malformed lesson id (expected L<number>)`); continue; }
    if (row.length !== 9) { errors.push(`${id}: expected 9 cells, found ${row.length}`); continue; }
    const l = Object.fromEntries(FIELDS.map((f, i) => [f, row[i]]));
    if (seen.has(id)) errors.push(`${id}: duplicate id`);
    seen.add(id);
    if (!isDate(l.date)) errors.push(`${id}: date "${l.date}" is not a real YYYY-MM-DD date`);
    if (!STAGES.includes(l.stage)) errors.push(`${id}: unknown stage "${l.stage}"`);
    if (!/^[a-z][a-z0-9-]*$/.test(l.category)) errors.push(`${id}: category "${l.category}" is not lowercase [a-z0-9-]`);
    for (const f of ["what", "evidence", "rule"]) if (!l[f]) errors.push(`${id}: empty ${f === "what" ? "what happened" : f}`);
    if (!CLASSES.includes(l.class)) errors.push(`${id}: unknown class "${l.class}"`);
    const sources = [...new Set(l.source.split(",").map((s) => s.trim()).filter(Boolean))];
    if (!sources.length) errors.push(`${id}: empty source`);
    for (const s of sources) if (!declared.has(s)) errors.push(`${id}: source "${s}" not declared in ## Sources`);
    if (l.class === "CONFIRMED REUSABLE" && sources.length < 2) errors.push(`${id}: CONFIRMED REUSABLE needs two or more sources`);
  }
  for (const id of new Set(cited)) {
    if (!/^L\d+$/.test(id)) errors.push(`${id}: malformed lesson citation (expected L<number>)`);
    else if (!seen.has(id)) errors.push(`${id} cited but not in lessons.md`);
  }
  return errors;
}

// Every L<digit>... token in the docs that cite lessons; malformed ones (L1O9) are reported by the lint.
export function citedIds(root) {
  return ["references/stages.md", "SKILL.md"]
    .map((p) => join(root, p))
    .filter(existsSync)
    .flatMap((p) => readFileSync(p, "utf8").match(/\bL\d\w*/g) ?? []);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [flag, rootArg, ...extra] = process.argv.slice(2);
  if (flag !== "--lint" || extra.length) {
    console.error("usage: lessons.mjs --lint [root]");
    process.exit(1);
  }
  const root = resolve(rootArg ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
  const file = join(root, "references", "lessons.md");
  if (!existsSync(file)) { console.error(`missing ${file}`); process.exit(1); }
  const text = readFileSync(file, "utf8");
  const errors = lintLessons(text, { cited: citedIds(root) });
  if (errors.length) { for (const e of errors) console.error(e); process.exit(1); }
  console.log(`ok: ${parseLessons(text).length} lessons`);
}
