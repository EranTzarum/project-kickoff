#!/usr/bin/env node
// PreToolUse/Edit|Write|Bash: refuses to create a migration whose numeric/timestamp prefix already
// exists locally or on origin/main. On the CRM, prefixes collided three times across parallel
// branches (0035 x3, 0045 x2), and live migration names then diverged from repo file names.
// Exit 2 = block. Only fires for new files under supabase/migrations/.
import { existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname } from "node:path";
import { readsOnly, FILE_READERS } from "./_shell.js";

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const { tool_input } = JSON.parse(input || "{}");
  const command = (tool_input?.command ?? "").replaceAll("\\", "/");
  const paths = [(tool_input?.file_path ?? "").replaceAll("\\", "/")];
  // Bash: every migration path named in a command that is not read-only. `cp 0001_b.sql supabase/migrations`
  // names only the directory, so pair it with each migration-looking file name in the command.
  if (command && !readsOnly(command, FILE_READERS, true)) {
    paths.push(...(command.match(/[^\s"'=<>;|&(]*supabase\/migrations\/[^\s"'<>;|&)]+/g) ?? []));
    const dirs = command.match(/[^\s"'=<>;|&(]*supabase\/migrations\/?(?=$|[\s"'<>;|&)])/g) ?? [];
    const names = command.match(/[0-9]{4,14}[_-][^\s"'/<>;|&)]+\.sql/g) ?? [];
    for (const d of dirs) for (const n of names) paths.push(`${d.replace(/\/$/, "")}/${n}`);
  }
  for (const path of paths) check(path);
  process.exit(0);
});

function check(path) {
  const m = path.match(/supabase\/migrations\/([0-9]{4,14})[_-][^/]+\.sql$/);
  if (!m || existsSync(path)) return; // not a migration, or editing an existing one

  const prefix = m[1];
  const file = basename(path);
  const dir = dirname(path);
  const local = existsSync(dir) ? readdirSync(dir) : [];
  let remote = [];
  try {
    remote = execFileSync("git", ["ls-tree", "-r", "--name-only", "origin/main", "--", "supabase/migrations"], { stdio: ["ignore", "pipe", "ignore"] })
      .toString().split(/\r?\n/).map((p) => basename(p));
  } catch { /* no git or no origin/main: local check only */ }

  const clash = [...local, ...remote].find((f) => f !== file && (f.startsWith(prefix + "_") || f.startsWith(prefix + "-")));
  if (clash) {
    process.stderr.write(
      `Blocked: migration prefix ${prefix} already exists (${clash}). ` +
        `Use a fresh timestamp (YYYYMMDDHHMM) so names never collide across branches.\n`
    );
    process.exit(2);
  }
}
