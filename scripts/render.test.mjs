// node --test scripts/render.test.mjs
// End-to-end check of render.mjs with templates/answers.example.json: the files it writes, that an
// existing file survives a second run, that --force replaces it, and that --stage N stays in its stage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const answers = join(here, "../templates/answers.example.json");
const render = (dir, ...extra) => spawnSync(process.execPath, [join(here, "render.mjs"), dir, answers, ...extra], { encoding: "utf8" });
const tmp = () => mkdtempSync(join(tmpdir(), "render-"));

const EXPECTED = [
  "docs/KICKOFF.md", "STATE.md", "docs/DOMAIN.md", "docs/ARCHITECTURE.md", "docs/MIGRATION_RUNBOOK.md",
  "docs/ENV_MATRIX.md", ".env.example", "supabase/migrations/_TEMPLATE.sql", "scripts/db-types.mjs",
  ".claude/settings.json", ".claude/hooks/block-env-edit.js", ".claude/hooks/block-destructive-sql.js",
  ".claude/hooks/migration-number-check.js", ".claude/hooks/service-role-guard.js",
  ".claude/agents/quality-gate.md", ".claude/agents/rls-auditor.md",
  "scripts/gates.mjs", "scripts/preflight.mjs", ".github/workflows/gates.yml",
  "supabase/migrations/00000000000000_auth_hook.sql", "AGENTS.md", "scripts/worktree-setup.ps1",
  "scripts/worktree-setup.sh", ".github/workflows/keepalive.yml", ".claude/hooks/_shell.js", ".claude/hooks/package.json",
  ".gitattributes",
];

test("full render writes every deliverable and leaves no placeholder", () => {
  const dir = tmp();
  const r = render(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /unfilled/);
  assert.match(r.stdout, /\d+ written, 0 skipped/);
  for (const f of EXPECTED) assert.ok(existsSync(join(dir, f)), `${f} missing`);
  assert.doesNotMatch(readFileSync(join(dir, "docs/KICKOFF.md"), "utf8"), /\{\{/);
  assert.equal(existsSync(join(dir, "CLAUDE.md")), false, "AGENTS.md is the only instruction file");
  assert.match(readFileSync(join(dir, "AGENTS.md"), "utf8"), /## Claude Code only/);
  assert.match(readFileSync(join(dir, "docs/KICKOFF.md"), "utf8"), /Rules file \| `AGENTS\.md`/);
  rmSync(dir, { recursive: true, force: true });
});

test("a second run skips existing files and keeps the owner's edits; --force replaces them", () => {
  const dir = tmp();
  render(dir);
  const f = join(dir, "docs/DOMAIN.md");
  writeFileSync(f, "OWNER EDIT\n");
  const again = render(dir);
  assert.match(again.stdout, /0 written, \d+ skipped/);
  assert.match(again.stdout, /skip\s+docs\/DOMAIN\.md \(exists\)/);
  assert.equal(readFileSync(f, "utf8"), "OWNER EDIT\n");
  render(dir, "--force");
  assert.notEqual(readFileSync(f, "utf8"), "OWNER EDIT\n");
  rmSync(dir, { recursive: true, force: true });
});

test("--stage 1 writes only the domain doc", () => {
  const dir = tmp();
  const r = render(dir, "--stage", "1");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /write\s+docs\/DOMAIN\.md/);
  assert.match(r.stdout, /1 written, 0 skipped/);
  assert.equal(existsSync(join(dir, "docs/ARCHITECTURE.md")), false);
  rmSync(dir, { recursive: true, force: true });
});

test("no answers file → usage error, exit 1", () => {
  const r = spawnSync(process.execPath, [join(here, "render.mjs"), tmp()], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage:/);
});

test("CI installs dependencies by what the repo uses, never an unconditional npm ci", () => {
  const dir = tmp();
  render(dir, "--stage", "5");
  const ci = readFileSync(join(dir, ".github/workflows/gates.yml"), "utf8");
  assert.doesNotMatch(ci, /^\s*- run: npm ci/m, "no unconditional npm ci");
  assert.doesNotMatch(ci, /cache: npm/, "npm cache needs a package-lock.json");
  assert.match(ci, /pnpm-lock\.yaml/);
  assert.match(ci, /yarn\.lock/);
  assert.match(ci, /actions\/setup-python@v5\r?\n\s+if: hashFiles\('requirements\.txt', 'pyproject\.toml'\) != ''/);
  assert.match(ci, /pip install -r requirements\.txt/);
  rmSync(dir, { recursive: true, force: true });
});
