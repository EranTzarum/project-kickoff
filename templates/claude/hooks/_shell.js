// Shared by the Bash-side guards. Allowlist, not a shell parser: a guard looks for its protected
// text (destructive SQL, a real .env, a migration path) anywhere in the raw command, and lets the
// command through only when it is built entirely from known read-only commands.
// Anything else that mentions the protected text is blocked, whatever the shell syntax around it
// (wrappers, pipelines, redirects, option spellings). Cost: a few false positives, which the owner
// overrides by hand. ponytail: add a command to a list below when a false positive keeps recurring.

// Split on ; & && | || newline ( ) and backtick, outside quotes. Returns the segment texts.
export function segments(command) {
  const out = [];
  let cur = "", quote = "";
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ""; };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      cur += c;
      if (c === "\\" && quote === '"') cur += command[++i] ?? "";
      else if (c === quote) quote = "";
      continue;
    }
    if (c === "'" || c === '"') { quote = c; cur += c; continue; }
    if (c === "\\") { cur += c + (command[++i] ?? ""); continue; }
    if (c === "&" && (cur.endsWith(">") || command[i + 1] === ">")) { cur += c; continue; } // 2>&1, &>
    if (c === "|" && (command[i + 1] === "|" || command[i + 1] === "&")) i++;
    if (c === "&" && command[i + 1] === "&") i++;
    if ("|;&\n()`".includes(c)) { push(); continue; }
    cur += c;
  }
  push();
  return out;
}

// Commands that only read the files they are given. Left out on purpose: less/more (-o writes),
// file (-C writes), sort (-o, --compress-program run things), find, xargs, sed, awk.
export const FILE_READERS = new Set(["cat", "type", "head", "tail", "grep", "rg", "wc", "ls", "stat", "diff", "cmp",
  "findstr", "select-string", "get-content"]);
// Commands that only print or filter text; enough to mention SQL without running it.
export const TEXT_READERS = new Set([...FILE_READERS, "echo", "printf", "uniq", "cut", "tr"]);

// Options that make an otherwise read-only command run another program (rg --pre, git grep -O).
const EXEC_OPTION = /\s(--pre\b|--pre-glob\b|--hostname-bin\b|--open-files-in-pager\b|-O\S*)/;

// True when every segment starts with an allowed command (also `git grep`), none carries an
// exec-capable option, no command substitution appears anywhere (also inside double quotes, where
// bash still runs it) and, if noRedirect, nothing is redirected to a file. Only complete fd
// duplications (2>&1, >&2) and >/dev/null do not count as redirects; `>&file` does.
export function readsOnly(command, allowed, noRedirect) {
  if (/\$\(|`|[<>]\(/.test(command)) return false;
  const text = command.replace(/\d*>&(\d+|-)(?=$|[\s;|&)])|\d*>\s*\/dev\/null(?=$|[\s;|&)])/g, "");
  if (noRedirect && text.includes(">")) return false;
  const segs = segments(text);
  return segs.length > 0 && segs.every((s) =>
    (allowed.has(s.split(/\s+/)[0].toLowerCase()) || /^git\s+grep\b/i.test(s)) && !EXEC_OPTION.test(s));
}
