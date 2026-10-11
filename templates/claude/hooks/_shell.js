// Shared by the Bash-side guards. Not a shell parser: it splits a command into simple-command
// segments and quote-aware tokens so a guard judges each part, not just the first word of the line.
// Safe by default: a protected path that appears in any command not on the read-only list counts
// as a write, whatever the command's own syntax (cp, dd of=, install -t, Set-Content -Path ...).
// ponytail: `eval`, variables and `$(...)` inside double quotes are not expanded; upgrade to a
// real shell parser only if a bypass shows up in practice.

// Split on ; & && | || newline ( ) and backtick, outside quotes. `piped` = fed by the previous segment.
// The script of `bash -c "..."` / `pwsh -Command "..."` is split too and appended after its wrapper.
export function segments(command, depth = 0) {
  const out = [];
  let cur = "", quote = "", piped = false;
  const push = (nextPiped) => {
    if (cur.trim()) out.push({ text: cur.trim(), piped });
    cur = "";
    piped = nextPiped;
  };
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
    if (c === "|") {
      const dbl = command[i + 1] === "|";
      if (dbl || command[i + 1] === "&") i++;
      push(!dbl);
      continue;
    }
    if (c === "&" && command[i + 1] === "&") i++;
    if (";&\n()`".includes(c)) { push(false); continue; }
    cur += c;
  }
  push(false);
  return depth >= 3 ? out : out.flatMap((s) => [s, ...inner(s.text, depth)]);
}

const WRAPPERS = new Set(["bash", "sh", "zsh", "dash", "ksh", "pwsh", "powershell", "cmd"]);
const base = (word) => (word ?? "").split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, "");

function inner(text, depth) {
  const toks = tokens(text);
  if (!WRAPPERS.has(base(toks[0]?.value))) return [];
  const i = toks.findIndex((t) => /^(-\w*c|-command|\/c)$/i.test(t.value));
  return i > 0 && toks[i + 1] ? segments(toks[i + 1].value, depth + 1) : [];
}

// Quote-aware words of one segment. mode: "" plain word, "out" redirect target (> >> >|),
// "in" input redirect target (<, <<). The fd operand of `2>&1` is dropped.
export function tokens(text) {
  const out = [];
  let cur = "", has = false, quote = "", mode = "";
  const flush = () => {
    if (!has) return;
    if (mode !== "skip") out.push({ value: cur, mode });
    mode = ""; cur = ""; has = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = "";
      else if (c === "\\" && quote === '"' && /["\\$`]/.test(text[i + 1] ?? "")) cur += text[++i];
      else cur += c;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; has = true; continue; }
    if (c === "\\" && /[ "'$`]/.test(text[i + 1] ?? "")) { cur += text[++i]; has = true; continue; }
    if (/\s/.test(c)) { flush(); continue; }
    if (c === ">" || c === "<") {
      if (c === ">" && has && /^\d+$/.test(cur)) { cur = ""; has = false; } // fd number, as in 2>file
      else flush();
      while (text[i + 1] === c) i++;
      if (c === ">" && text[i + 1] === "|") i++;
      if (c === ">" && text[i + 1] === "&") { i++; mode = "skip"; }
      else mode = c === ">" ? "out" : "in";
      continue;
    }
    cur += c;
    has = true;
  }
  flush();
  return out;
}

// Commands that only read their path arguments (unless sed/perl run in place). Anything else that
// names a protected path is treated as a write.
const READ_ONLY = new Set(["cat", "type", "grep", "rg", "head", "tail", "less", "more", "wc", "ls", "file", "stat",
  "diff", "cmp", "echo", "printf", "sed", "sort", "uniq", "cut", "tr", "findstr", "select-string", "get-content"]);

// Every string that may name a file this command writes: redirect targets, plus every argument of
// a command that is not read-only (a `k=v` argument also yields `v`, for `dd of=`).
export function writeCandidates(command) {
  const out = [];
  for (const { text } of segments(command)) {
    const toks = tokens(text);
    for (const t of toks) if (t.mode === "out") out.push(t.value);
    const args = toks.filter((t) => !t.mode);
    const cmd = base(args[0]?.value);
    const inPlace = /^(sed|perl)$/.test(cmd) && args.some((t) => /^(-[a-z]*i|--in-place)/i.test(t.value));
    if (READ_ONLY.has(cmd) && !inPlace) continue;
    for (const t of args.slice(1)) out.push(t.value, t.value.replace(/^[\w-]+=/, ""));
  }
  return out.map((p) => p.replaceAll("\\", "/"));
}
