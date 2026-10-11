#!/usr/bin/env node
// PreToolUse/Edit|Write|Bash: refuses to create a migration whose numeric/timestamp prefix already
// exists locally or on origin/main. On the CRM, prefixes collided three times across parallel
// branches (0035 x3, 0045 x2), and live migration names then diverged from repo file names.
// Exit 2 = block. Only fires for new files under supabase/migrations/.
import { existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname } from "node:path";
import { writeCandidates } from "./_shell.js";

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const { tool_input } = JSON.parse(input || "{}");
  const cands = [tool_input?.file_path ?? "", ...writeCandidates(tool_input?.command ?? "")].map((p) => p.replaceAll("\\", "/"));
  // `cp 0001_b.sql supabase/migrations` names only the directory: pair it with each migration-looking basename.
  const dirs = cands.filter((c) => /(^|\/)supabase\/migrations\/?$/.test(c)).map((d) => d.replace(/\/$/, ""));
  const names = cands.map((c) => c.split("/").pop()).filter((b) => /^[0-9]{4,14}[_-][^/]+\.sql$/.test(b));
  for (const path of [...cands, ...dirs.flatMap((d) => names.map((n) => `${d}/${n}`))]) check(path);
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
