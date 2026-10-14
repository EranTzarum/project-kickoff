// node --test scripts/lessons.test.mjs
// references/lessons.md: every row has a declared source and a class; lessons.mjs --lint keeps it honest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseLessons, lintLessons, declaredSources, citedIds } from "./lessons.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const real = readFileSync(join(root, "references/lessons.md"), "utf8");
const run = (args) => spawnSync(process.execPath, [join(here, "lessons.mjs"), ...args], { encoding: "utf8" });

const doc = (rows) => [
  "# Lessons", "", "## Sources", "", "- `P1` — an invented shop app", "- `P2` — an invented booking app", "",
  "## Build loop", "",
  "| id | date | category | what happened | evidence | rule | stage | source | class |",
  "|---|---|---|---|---|---|---|---|---|",
  ...rows, "",
].join("\n");
const row = (id, o = {}) => {
  const c = { date: "2026-01-05", category: "process", what: "w", evidence: "e", rule: "r", stage: "build-loop", source: "P1", class: "CANDIDATE REUSABLE", ...o };
  return `| ${id} | ${c.date} | ${c.category} | ${c.what} | ${c.evidence} | ${c.rule} | ${c.stage} | ${c.source} | ${c.class} |`;
};

test("the real lessons.md passes the lint with its cited ids", () => {
  assert.deepEqual(lintLessons(real, { cited: citedIds(root) }), []);
  const lessons = parseLessons(real);
  assert.equal(lessons.length, 108);
  assert.equal(lessons.find((l) => l.id === "L108").source, "K");
  assert.equal(lessons.find((l) => l.id === "L5").source, "P1");
  assert.ok(lessons.every((l) => l.class === "CANDIDATE REUSABLE"));
  assert.deepEqual(declaredSources(real), ["P1", "P2", "K"]);
});

test("each error is reported once, naming the id", () => {
  const text = doc([
    row("L1"),
    row("L2", { date: "2026-02-30" }),
    row("L3", { stage: "deploy" }),
    "| L4 | 2026-01-05 | process | w | e | r | build-loop | P1 |",
    row("L1"),
    row("L5", { source: "P9" }),
    row("L6", { class: "CONFIRMED REUSABLE" }),
    row("L7", { category: "Process" }),
    row("L8", { what: "" }),
    row("L9", { class: "MAYBE" }),
  ]);
  const errors = lintLessons(text, { cited: ["L1", "L999"] });
  const expect = [
    ["L2:", /date/], ["L3:", /stage/], ["L4:", /9 cells/], ["L1:", /duplicate/], ["L5:", /P9/],
    ["L6:", /two or more/], ["L7:", /category/], ["L8:", /what happened/], ["L9:", /class/],
  ];
  for (const [id, re] of expect) assert.equal(errors.filter((e) => e.startsWith(id) && re.test(e)).length, 1, `${id} ${re}`);
  assert.equal(errors.filter((e) => e === "L999 cited but not in lessons.md").length, 1);
  assert.equal(errors.length, expect.length + 1);
});

test("CONFIRMED REUSABLE with two sources passes; an escaped pipe stays in one cell", () => {
  const text = doc([row("L1", { class: "CONFIRMED REUSABLE", source: "P1, P2", what: "a \\| b" })]);
  assert.deepEqual(lintLessons(text), []);
  assert.equal(parseLessons(text)[0].what, "a \\| b");
  assert.equal(parseLessons(text)[0].class, "CONFIRMED REUSABLE");
});

test("CLI: a bad file exits 1 with the error on stderr; the repo exits 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "lessons-"));
  try {
    mkdirSync(join(dir, "references"));
    writeFileSync(join(dir, "references/lessons.md"), doc([row("L1", { stage: "deploy" })]));
    const bad = run(["--lint", dir]);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /L1: unknown stage/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const ok = run(["--lint"]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout.trim(), "ok: 108 lessons");
  assert.equal(run([]).status, 1);
});

test("a malformed id in a row or a citation is an error, not skipped", () => {
  const errors = lintLessons(doc([row("L1"), row("L1O9"), row("L 109")]), { cited: ["L1", "L1O9"] });
  assert.ok(errors.includes("L 109: malformed lesson id (expected L<number>)"), errors.join("; "));
  assert.ok(errors.includes("L1O9: malformed lesson id (expected L<number>)"), errors.join("; "));
  assert.ok(errors.includes("L1O9: malformed lesson citation (expected L<number>)"), errors.join("; "));
  const dir = mkdtempSync(join(tmpdir(), "lessons-cite-"));
  mkdirSync(join(dir, "references"));
  writeFileSync(join(dir, "references/stages.md"), "- a rule — L1, L1O9\n");
  assert.deepEqual(citedIds(dir), ["L1", "L1O9"]);
  rmSync(dir, { recursive: true, force: true });
});

test("an indented lessons table is still linted", () => {
  const text = doc([row("L1"), row("L 109")]).split("\n").map((l) => (l.startsWith("|") ? " " + l : l)).join("\n");
  assert.ok(lintLessons(text).includes("L 109: malformed lesson id (expected L<number>)"));
  assert.equal(parseLessons(text).length, 2);
});
