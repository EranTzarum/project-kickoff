#!/usr/bin/env node
// PreToolUse/Bash: blocks raw destructive SQL (DROP TABLE / TRUNCATE / DELETE without WHERE)
// so it requires an explicit human decision instead of running via a shell command.
//
// False-positive fixes learned on the CRM: the Tailwind class `truncate` and grep/sed
// patterns that merely *mention* "delete from" used to trip this hook. So:
//   * read-only segments (grep/rg/sed/cat/echo/git grep/Select-String/findstr) are skipped,
//     but only that segment: a destructive command later in the line is still caught
//   * TRUNCATE must look like a statement: `truncate [table] <ident>` followed by `;`, `cascade`,
//     `restart`, or end of line — not a bare word inside a class list
import { segments } from "./_shell.js";

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const { tool_input } = JSON.parse(input || "{}");
  const command = tool_input?.command ?? "";

  // Judge every segment on its own: `echo ready; psql -c "DROP TABLE t"` must not pass because
  // the line starts with echo. A segment piped from a read-only one is scanned together with it
  // (`echo "DROP TABLE t" | psql`).
  const isReadOnly = (text) =>
    /^(grep|rg|sed|cat|echo|head|tail|less|select-string|findstr)$/i.test(text.split(/\s+/)[0] ?? "") ||
    /^git\s+grep\b/i.test(text);

  const patterns = [
    /\bdrop\s+table\b/i,
    /\btruncate\s+(table\s+)?[\w."]+\s*(;|cascade\b|restart\b|$)/im,
    /\bdelete\s+from\s+[\w."]+\s*(?![^;]*\bwhere\b)/i,
  ];

  const segs = segments(command);
  let hit;
  segs.forEach(({ text, piped }, i) => {
    if (hit || isReadOnly(text)) return;
    const scan = piped && i > 0 ? `${segs[i - 1].text}\n${text}` : text;
    hit = patterns.find((p) => p.test(scan));
  });
  if (hit) {
    process.stderr.write(
      `Blocked: command looks like destructive SQL (${hit}) run from a shell.\n` +
        `Put it in a reviewed migration, run it in the database SQL editor, or confirm explicitly with the user first.\n`
    );
    process.exit(2);
  }
  process.exit(0);
});
