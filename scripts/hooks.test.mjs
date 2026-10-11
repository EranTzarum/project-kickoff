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
const all = (hook, cmds, want, cwd) => { for (const c of cmds) assert.equal(bash(hook, c, cwd), want, c); };

test("sql: destructive SQL after a read-only first word is blocked", () => {
  all("block-destructive-sql.js", [
    'echo ready; psql -c "DROP TABLE accounts"',
    'echo ready && psql -c "TRUNCATE TABLE accounts;"',
    'cat notes.txt\npsql -c "DROP TABLE accounts"',
    'echo "DROP TABLE accounts" | psql',
    'echo "DROP TABLE accounts" | cat | psql',
    'echo "DROP TABLE accounts" | tee x.sql | cat | psql',
    'echo $(psql -c "DROP TABLE accounts")',
    'psql -c "DROP TABLE accounts"',
    'bash -c "psql -c \'DROP TABLE accounts\'"',
    'echo "DROP TABLE accounts" | (cat) | psql',
    'psql -c "delete from accounts" && grep where notes.txt',
    'echo "DROP TABLE accounts" |& psql',
    `echo "$(psql -c 'DROP TABLE accounts')"`,
    "echo `psql -c 'DROP TABLE accounts'`",
    `git grep --open-files-in-pager="psql -c 'DROP TABLE accounts'" needle`,
    `git grep -O"psql -c 'DROP TABLE accounts'" needle`,
    `rg --pre=./run-sql 'DROP TABLE accounts' .`,
    `git grep "--open-files-in-pager=psql -c 'DROP TABLE accounts'" needle`,
    `rg "--pre=./run-sql" 'DROP TABLE accounts' .`,
    `rg --p're'=./run-sql 'DROP TABLE accounts' .`,
  ], 2);
});

test("sql: read-only mentions and harmless commands still pass", () => {
  all("block-destructive-sql.js", [
    'grep -rn "drop table" supabase/',
    'rg "delete from" . 2>&1 | head -5',
    'rg "delete from" . | uniq | wc -l',
    'echo "DROP TABLE accounts" > migration-draft.sql',
    'echo "a; b" && psql -c "select 1"',
    'git grep "truncate table" -- docs',
    "npm test 2>&1",
  ], 0);
});

test("env: any non-read-only command that names a real .env, and redirects to one, are blocked", () => {
  all("block-env-edit.js", [
    "echo K=1 > .env", "echo K=1>>.env.local", 'echo K=1 > "apps/my app/.env"', "cp .env.example .env",
    "cp .env apps/web", "cp .env /tmp/env-backup", "cp -t apps/web .env", "install -m 600 x .env", "tee .env < x",
    "echo ok; mv x .env", "dd if=/dev/zero of=.env count=1", "dd if=.env of=/tmp/x",
    "sed -i s/a/b/ .env", "sed --in-place s/a/b/ .env", "sed --in-place=.bak s/a/b/ .env",
    'bash -c "cp example .env"', "bash -c 'cp example .env' arg0", '/bin/bash -c "cp example .env"', "sh -c 'echo K=1 > .env'",
    "cat .env > /tmp/env-backup", "sed -n p .env", "printf K=1 >|.env", "sort -o .env values.txt", "sed 'w .env' values.txt",
    "bash -cl 'printf K=1 > .env'", "env bash -c 'printf K=1 > .env'", "Set-Content -Path .env -Value x",
    'cat "$(cp .env.example .env)"', "cat `cp .env.example .env`", "cat .env.example >&.env", "cat .env.example &>.env",
    "rg --pre=./rewrite-env K .env", 'rg "--pre=./rewrite-env" K .env', "git grep -O'./rewrite-env' K .env","sort --compress-program=./rewrite-env .env",
  ], 2);
  assert.equal(exitOf("block-env-edit.js", { file_path: "apps/web/.env" }), 2, "Edit/Write path still blocked");
});

test("env: reads and .env.example pass", () => {
  all("block-env-edit.js", [
    "cat .env", "grep K .env", "head -n1 .env | wc -l", "cat .env 2>&1", "rg K .env", "cat .envrc",
    "echo K= >> .env.example", "cp .env.example docs/env.txt", "npm test 2>&1", "git status",
  ], 0);
  assert.equal(exitOf("block-env-edit.js", { file_path: ".env.example" }), 0);
});

test("migrations: shell writes to a taken prefix are blocked; fresh prefix, existing file and reads pass", () => {
  const h = "migration-number-check.js";
  const dir = mkdtempSync(join(tmpdir(), "hooks-"));
  mkdirSync(join(dir, "supabase/migrations"), { recursive: true });
  writeFileSync(join(dir, "supabase/migrations/0001_a.sql"), "select 1;\n");
  all(h, [
    "echo 'select 2;' > supabase/migrations/0001_b.sql",
    'echo x > "supabase/migrations/0001_h.sql"',
    "cp x.sql supabase/migrations/0001_c.sql",
    "cp 0001_b.sql supabase/migrations",
    "mv 0001_b.sql supabase/migrations/",
    "dd if=x.sql of=supabase/migrations/0001_e.sql",
    'bash -c "cp x.sql supabase/migrations/0001_f.sql"',
    '/bin/bash -c "cp x.sql supabase/migrations/0001_g.sql" extra',
    "printf x >|supabase/migrations/0001_i.sql",
    "env bash -c 'cp x.sql supabase/migrations/0001_j.sql'",
    "cat draft.sql >&supabase/migrations/0001_k.sql",
    'cat "$(cp x.sql supabase/migrations/0001_l.sql)"',
  ], 2, dir);
  all(h, [
    "echo 'select 2;' > supabase/migrations/0002_b.sql",
    "echo more >> supabase/migrations/0001_a.sql",
    "cat supabase/migrations/0001_a.sql",
    "cp supabase/migrations/0001_a.sql /tmp/copy.sql",
    "cp 0002_b.sql supabase/migrations",
  ], 0, dir);
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
