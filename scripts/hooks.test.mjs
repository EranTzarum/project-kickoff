// node --test scripts/hooks.test.mjs
// Runs the guardrail hooks the way Claude Code does (JSON on stdin, exit 2 = block) and proves
// the shell bypasses from issue #2 are closed without blocking read-only commands.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const hooks = join(dirname(fileURLToPath(import.meta.url)), "../templates/claude/hooks");
const exitOf = (hook, tool_input, cwd = process.cwd()) =>
  spawnSync(process.execPath, [join(hooks, hook)], { input: JSON.stringify({ tool_input }), cwd, encoding: "utf8" }).status;
const bash = (hook, command, cwd) => exitOf(hook, { command }, cwd);

test("sql: destructive SQL after a read-only first word is blocked", () => {
  const h = "block-destructive-sql.js";
  assert.equal(bash(h, 'echo ready; psql -c "DROP TABLE accounts"'), 2);
  assert.equal(bash(h, 'echo ready && psql -c "TRUNCATE TABLE accounts;"'), 2);
  assert.equal(bash(h, 'cat notes.txt\npsql -c "DROP TABLE accounts"'), 2);
  assert.equal(bash(h, 'echo "DROP TABLE accounts" | psql'), 2);
  assert.equal(bash(h, 'echo $(psql -c "DROP TABLE accounts")'), 2);
  assert.equal(bash(h, 'psql -c "DROP TABLE accounts"'), 2);
  assert.equal(bash(h, 'echo "DROP TABLE accounts" | cat | psql'), 2, "longer pipeline");
  assert.equal(bash(h, 'echo "DROP TABLE accounts" | tee x.sql | cat | psql'), 2);
  assert.equal(bash(h, 'bash -c "psql -c \'DROP TABLE accounts\'"'), 2);
});

test("sql: read-only mentions and harmless commands still pass", () => {
  const h = "block-destructive-sql.js";
  assert.equal(bash(h, 'grep -rn "drop table" supabase/'), 0);
  assert.equal(bash(h, 'rg "delete from" . 2>&1 | head -5'), 0);
  assert.equal(bash(h, 'echo "a; b" && psql -c "select 1"'), 0);
  assert.equal(bash(h, 'git grep "truncate table" -- docs'), 0);
  assert.equal(bash(h, 'npm test 2>&1'), 0);
  assert.equal(bash(h, 'rg "delete from" . | sort | uniq | wc -l'), 0);
});

test("env: shell writes to a real .env are blocked, reads and .env.example pass", () => {
  const h = "block-env-edit.js";
  for (const c of ["echo K=1 > .env", "echo K=1>>.env.local", "cp .env.example .env", "tee .env < x", "sed -i s/a/b/ .env", "echo ok; mv x .env", "dd if=/dev/zero of=.env count=1", 'bash -c "cp example .env"', "sh -c 'echo K=1 > .env'", "install -m 600 x .env", "cp -t apps/web .env"]) {
    assert.equal(bash(h, c), 2, c);
  }
  for (const c of ["cat .env", "grep K .env", "echo K= >> .env.example", "cp .env.example docs/env.txt", "npm test 2>&1", "sed -n p .env", "cp .env /tmp/env-backup", "cat .env > /tmp/env-backup", "dd if=.env of=/tmp/x"]) {
    assert.equal(bash(h, c), 0, c);
  }
  assert.equal(exitOf(h, { file_path: "apps/web/.env" }), 2, "Edit/Write path still blocked");
  assert.equal(exitOf(h, { file_path: ".env.example" }), 0);
});

test("migrations: shell write to a taken prefix is blocked, fresh prefix and existing file pass", () => {
  const h = "migration-number-check.js";
  const dir = mkdtempSync(join(tmpdir(), "hooks-"));
  mkdirSync(join(dir, "supabase/migrations"), { recursive: true });
  writeFileSync(join(dir, "supabase/migrations/0001_a.sql"), "select 1;\n");
  assert.equal(bash(h, "echo 'select 2;' > supabase/migrations/0001_b.sql", dir), 2);
  assert.equal(bash(h, "cp x.sql supabase/migrations/0001_c.sql", dir), 2);
  assert.equal(bash(h, "dd if=x.sql of=supabase/migrations/0001_e.sql", dir), 2);
  assert.equal(bash(h, 'bash -c "cp x.sql supabase/migrations/0001_f.sql"', dir), 2);
  assert.equal(bash(h, "cp supabase/migrations/0001_a.sql /tmp/copy.sql", dir), 0, "read-only source");
  assert.equal(bash(h, "echo 'select 2;' > supabase/migrations/0002_b.sql", dir), 0);
  assert.equal(bash(h, "echo more >> supabase/migrations/0001_a.sql", dir), 0, "existing file");
  assert.equal(bash(h, "cat supabase/migrations/0001_a.sql", dir), 0);
  assert.equal(exitOf(h, { file_path: "supabase/migrations/0001_d.sql" }, dir), 2, "Edit/Write path still blocked");
  rmSync(dir, { recursive: true, force: true });
});

test("hooks run in a project whose package.json says commonjs", () => {
  const dir = mkdtempSync(join(tmpdir(), "hooks-cjs-"));
  writeFileSync(join(dir, "package.json"), '{ "type": "commonjs" }');
  mkdirSync(join(dir, ".claude/hooks"), { recursive: true });
  for (const f of ["_shell.js", "package.json", "block-env-edit.js", "block-destructive-sql.js"]) copyFileSync(join(hooks, f), join(dir, ".claude/hooks", f));
  const run = (hook, command) => spawnSync(process.execPath, [join(dir, ".claude/hooks", hook)], { input: JSON.stringify({ tool_input: { command } }), cwd: dir, encoding: "utf8" });
  assert.equal(run("block-env-edit.js", "echo K=1 > .env").status, 2);
  assert.equal(run("block-destructive-sql.js", 'psql -c "DROP TABLE t"').status, 2);
  rmSync(dir, { recursive: true, force: true });
});
