// node --test scripts/to-crew.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseTicket, readGates, checkDag, buildDag } from "./to-crew.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const run = (args) => spawnSync(process.execPath, [join(here, "to-crew.mjs"), ...args], { encoding: "utf8" });

const GATES = ["npm test", "npm run lint"];
const ticket = ({ id, blocked = "", model = "sonnet", extra = "", body = "# t\n## CONSTRAINTS\n- none\n" }) =>
  `---\nid: ${id}\nengine: claude\nmodel: ${model}\nwrite_set: src/${id}/**, tests/${id}/**\naccept: npm test -- ${id}\nblocked_by: ${blocked}\n${extra}---\n${body}`;

function fixture(t, { gates = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "to-crew-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "docs"));
  mkdirSync(join(root, ".tickets"));
  writeFileSync(
    join(root, "docs", "KICKOFF.md"),
    gates ? `# K\n\n\`\`\`gates\n# comment\n${GATES.join("\n")}\n\n\`\`\`\n` : "# K\n",
  );
  writeFileSync(join(root, ".tickets", "inv-1.md"), ticket({ id: "inv-1" }));
  writeFileSync(join(root, ".tickets", "inv-2.md"), ticket({ id: "inv-2", blocked: "inv-1" }));
  return root;
}
const cli = (root, ...more) => run([root, "--feature", "inv", "--base", "feature/inv", ...more]);

test("CLI writes crew.json with frame, gates and tickets; checkDag passes", (t) => {
  const root = fixture(t);
  const r = cli(root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^crew\.json: 2 tickets \(2 added, 0 replaced\) -> /);
  const text = readFileSync(join(root, "crew.json"), "utf8");
  assert.ok(text.endsWith("}\n"));
  const dag = JSON.parse(text);
  assert.equal(dag.schema_version, 1);
  assert.equal(dag.slug, "inv");
  assert.equal(dag.base_branch, "feature/inv");
  assert.ok(dag.repo.length > 0);
  assert.deepEqual(dag.validate, GATES);
  assert.deepEqual(dag.tickets.map((x) => x.id), ["inv-1", "inv-2"]);
  assert.deepEqual(dag.tickets[1], {
    id: "inv-2", engine: "claude", model: "sonnet", brief_path: ".tickets/inv-2.md",
    write_set: ["src/inv-2/**", "tests/inv-2/**"], accept: ["npm test -- inv-2"], blocked_by: ["inv-1"],
  });
  assert.deepEqual(dag.tickets[0].blocked_by, []);
  assert.deepEqual(checkDag(dag, root), []);
});

test("existing crew.json keeps its frame; tickets are merged", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, ".tickets", "inv-3.md"), ticket({ id: "inv-3" }));
  const existing = {
    schema_version: 1, repo: "/elsewhere", slug: "old", base_branch: "feature/other", global_cap: 2,
    validate: ["echo ok"],
    tickets: [
      { id: "inv-1", engine: "codex", model: "other-model", brief_path: ".tickets/inv-1.md", write_set: ["x"], accept: ["y"], blocked_by: [] },
      { id: "keep-me", engine: "claude", model: "m", brief_path: ".tickets/inv-1.md", write_set: ["x"], accept: ["y"], blocked_by: [] },
    ],
  };
  writeFileSync(join(root, "crew.json"), JSON.stringify(existing));
  const r = cli(root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /4 tickets \(2 added, 1 replaced\)/);
  const dag = JSON.parse(readFileSync(join(root, "crew.json"), "utf8"));
  assert.equal(dag.global_cap, 2);
  assert.equal(dag.base_branch, "feature/other");
  assert.equal(dag.repo, "/elsewhere");
  assert.equal(dag.slug, "old");
  assert.deepEqual(dag.validate, ["echo ok"]);
  assert.deepEqual(dag.tickets.map((x) => x.id), ["inv-1", "keep-me", "inv-2", "inv-3"]);
  assert.equal(dag.tickets[0].model, "sonnet");
  assert.equal(dag.tickets[0].engine, "claude");
});

test("errors exit 1 and write nothing", async (t) => {
  const cases = {
    "base main": { args: ["--base", "main"], expect: /base branch must be a feature branch, not main; create one first \(git switch -c feature\/inv\)/ },
    "no constraints": { setup: (r) => writeFileSync(join(r, ".tickets", "inv-1.md"), ticket({ id: "inv-1", body: "# t\nnothing\n" })), expect: /CONSTRAINTS/ },
    "brief over 8000": { setup: (r) => writeFileSync(join(r, ".tickets", "inv-1.md"), ticket({ id: "inv-1", body: "## CONSTRAINTS\n" + "x".repeat(8000) })), expect: /8000/ },
    "unknown key": { setup: (r) => writeFileSync(join(r, ".tickets", "inv-1.md"), ticket({ id: "inv-1", extra: "colour: red\n" })), expect: /colour/ },
    "unknown blocked_by": { setup: (r) => writeFileSync(join(r, ".tickets", "inv-2.md"), ticket({ id: "inv-2", blocked: "ghost" })), expect: /unknown id: ghost/ },
    "cycle": { setup: (r) => writeFileSync(join(r, ".tickets", "inv-1.md"), ticket({ id: "inv-1", blocked: "inv-2" })), expect: /inv-1 -> inv-2 -> inv-1|inv-2 -> inv-1 -> inv-2/ },
    "duplicate id": { setup: (r) => writeFileSync(join(r, ".tickets", "inv-2.md"), ticket({ id: "inv-1" })), expect: /duplicate id: inv-1/ },
    "no gates": { opts: { gates: false }, expect: /gates/ },
    "no tickets": { feature: "zzz", expect: /no tickets: \.tickets\/zzz-\*\.md/ },
  };
  for (const [name, c] of Object.entries(cases)) {
    await t.test(name, (t2) => {
      const root = fixture(t2, c.opts);
      c.setup?.(root);
      const r = run([root, "--feature", c.feature || "inv", ...(c.args || ["--base", "feature/inv"])]);
      assert.equal(r.status, 1, r.stdout);
      assert.match(r.stderr, c.expect);
      assert.equal(existsSync(join(root, "crew.json")), false);
    });
  }
});

test("wrong usage prints usage and exits 1", () => {
  const r = run([]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage:/);
});

test("parseTicket: repeated accept keeps order and commas; blank blocked_by is []", () => {
  const p = parseTicket(
    "---\n# note\nid: a-1\nengine: codex\nmodel: m\nwrite_set: a/**\naccept: echo a, b\naccept: npm test\nblocked_by:\nskills: s1, s2\n---\n## CONSTRAINTS\n",
  );
  assert.deepEqual(p.accept, ["echo a, b", "npm test"]);
  assert.deepEqual(p.blocked_by, []);
  assert.deepEqual(p.skills, ["s1", "s2"]);
  assert.throws(() => parseTicket("---\nid: a\nid: b\n---\n"), /repeated/);
  assert.throws(() => parseTicket("---\nid: a\n---\n"), /missing front-matter key/);
});

test("readGates ignores comments and blanks", (t) => {
  assert.deepEqual(readGates(fixture(t)), GATES);
  assert.deepEqual(readGates(fixture(t, { gates: false })), []);
});

test("tickets are in natural order: inv-2 before inv-10", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, ".tickets", "inv-10.md"), ticket({ id: "inv-10" }));
  const dag = buildDag(root, "inv", { base: "feature/inv" });
  assert.deepEqual(dag.tickets.map((x) => x.id), ["inv-1", "inv-2", "inv-10"]);
});

test("an existing crew.json on main is refused and left unchanged", (t) => {
  const root = fixture(t);
  const before = JSON.stringify({ schema_version: 1, repo: root, slug: "inv", base_branch: "main", validate: ["echo ok"], tickets: [] });
  writeFileSync(join(root, "crew.json"), before);
  const r = cli(root);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /not main; .*set base_branch in crew\.json/);
  assert.equal(readFileSync(join(root, "crew.json"), "utf8"), before);
});

test("a feature name does not pick up another feature that shares its prefix", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, ".tickets", "inv-export-1.md"), ticket({ id: "inv-export-1" }));
  writeFileSync(join(root, ".tickets", "inv-notes.md"), ticket({ id: "inv-notes" }));
  const dag = buildDag(root, "inv", { base: "feature/inv" });
  assert.deepEqual(dag.tickets.map((x) => x.id), ["inv-1", "inv-2"]);
});
