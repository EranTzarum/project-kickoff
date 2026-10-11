#!/usr/bin/env node
// PreToolUse/Bash: blocks raw destructive SQL (DROP TABLE / TRUNCATE / DELETE without WHERE)
// so it requires an explicit human decision instead of running via a shell command.
//
// False-positive fixes learned on the CRM: the Tailwind class `truncate` and grep/sed
// patterns that merely *mention* "delete from" used to trip this hook. So:
//   * a command built only from text readers (grep/rg/cat/echo/git grep/Select-String/findstr ...)
//     may mention SQL; if anything else is in the line (psql, bash -c, a pipe into a shell ...)
//     and a segment contains destructive SQL, it is blocked. Patterns are matched per segment so a
//     later `where` in the line cannot excuse an earlier DELETE.
//   * TRUNCATE must look like a statement: `truncate [table] <ident>` followed by `;`, `cascade`,
//     `restart`, or end of line — not a bare word inside a class list
import { segments, readsOnly, TEXT_READERS } from "./_shell.js";

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const { tool_input } = JSON.parse(input || "{}");
  const command = tool_input?.command ?? "";

  const patterns = [
    /\bdrop\s+table\b/i,
    /\btruncate\s+(table\s+)?[\w."]+\s*(;|cascade\b|restart\b|$)/im,
    /\bdelete\s+from\s+[\w."]+\s*(?![^;]*\bwhere\b)/i,
  ];

  const safe = readsOnly(command, TEXT_READERS, false);
  const hit = safe ? undefined : segments(command).map((seg) => patterns.find((p) => p.test(seg))).find(Boolean);
  if (hit) {
    process.stderr.write(
      `Blocked: command looks like destructive SQL (${hit}) run from a shell.\n` +
        `Put it in a reviewed migration, run it in the database SQL editor, or confirm explicitly with the user first.\n`
    );
    process.exit(2);
  }
  process.exit(0);
});
