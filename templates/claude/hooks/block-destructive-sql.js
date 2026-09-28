#!/usr/bin/env node
// PreToolUse/Bash: blocks raw destructive SQL (DROP TABLE / TRUNCATE / DELETE without WHERE)
// so it requires an explicit human decision instead of running via a shell command.
//
// False-positive fixes learned on the CRM: the Tailwind class `truncate` and grep/sed
// patterns that merely *mention* "delete from" used to trip this hook. So:
//   * read-only commands (grep/rg/sed/cat/echo/git grep/Select-String/findstr) are skipped
//   * TRUNCATE must look like a statement: `truncate [table] <ident>` followed by `;`, `cascade`,
//     `restart`, or end of line — not a bare word inside a class list
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const { tool_input } = JSON.parse(input || "{}");
  const command = tool_input?.command ?? "";

  const firstWord = command.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const readOnly = /^(grep|rg|sed|cat|echo|head|tail|less|find|select-string|findstr|awk)$/.test(firstWord) ||
    /^git\s+grep\b/i.test(command.trim());
  if (readOnly) process.exit(0);

  const patterns = [
    /\bdrop\s+table\b/i,
    /\btruncate\s+(table\s+)?[\w."]+\s*(;|cascade\b|restart\b|$)/im,
    /\bdelete\s+from\s+[\w."]+\s*(?![^;]*\bwhere\b)/i,
  ];

  const hit = patterns.find((p) => p.test(command));
  if (hit) {
    process.stderr.write(
      `Blocked: command looks like destructive SQL (${hit}) run from a shell.\n` +
        `Put it in a reviewed migration, run it in the database SQL editor, or confirm explicitly with the user first.\n`
    );
    process.exit(2);
  }
  process.exit(0);
});
