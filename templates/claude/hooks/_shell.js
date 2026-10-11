// Shared by the Bash-side guards. Not a shell parser: it splits a command into simple-command
// segments so a guard can judge each one, instead of trusting the first word of the whole line.
// ponytail: `eval`, variables and `$(...)` inside double quotes are not expanded; upgrade to a
// real shell parser only if a bypass shows up in practice.

// Split on ; & && | || newline ( ) and backtick, outside quotes. `piped` = fed by the previous segment.
// The body of `bash -c "..."` / `pwsh -Command "..."` is split too and appended after its wrapper.
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

const WRAPPER = /^(bash|sh|zsh|dash|ksh|pwsh|powershell|cmd)(\.exe)?\s/i;
function inner(text, depth) {
  if (!WRAPPER.test(text)) return [];
  const m = text.match(/\s(?:-\w*c|-command|\/c)\s+(["'])([\s\S]*)\1\s*$/i);
  return m ? segments(m[1] === '"' ? m[2].replace(/\\(["\\$`])/g, "$1") : m[2], depth + 1) : [];
}

const words = (s) => s.split(/\s+/).filter(Boolean).map((w) => w.replace(/^["']|["']$/g, "").replaceAll("\\", "/"));
const positional = (ws) => ws.slice(1).filter((w) => !w.startsWith("-"));

// Paths a command writes to: redirect targets plus the destination operands of cp/mv/tee/dd/touch,
// sed -i, perl -i and the PowerShell writers. Sources that are only read are not returned.
export function writeTargets(command) {
  const out = [];
  for (const { text } of segments(command)) {
    const t = text.replace(/\d*>&\d*|\d*>\s*\/dev\/null/g, "");
    for (const m of t.matchAll(/>>?\|?\s*([^\s;&|<>]+)/g)) out.push(m[1].replace(/^["']|["']$/g, "").replaceAll("\\", "/"));
    const ws = words(t.replace(/>>?\|?\s*[^\s;&|<>]+|<\s*[^\s;&|<>]+/g, " "));
    const cmd = (ws[0] ?? "").toLowerCase();
    const args = positional(ws);
    if (/^(cp|install|ln|rsync|copy-item|move-item)$/.test(cmd)) {
      if (args.length) out.push(args.at(-1));
      const dir = t.match(/(?:\s-t\s+|--target-directory[= ]|\s-destination\s+)(\S+)/i)?.[1];
      if (dir) out.push(dir.replace(/^["']|["']$/g, ""));
    } else if (/^(mv|tee|touch|truncate|set-content|add-content|out-file|new-item)$/.test(cmd)) out.push(...args);
    else if (cmd === "dd") out.push(...ws.filter((w) => w.startsWith("of=")).map((w) => w.slice(3)));
    else if (/^(sed|perl)$/.test(cmd) && /\s-\w*i/.test(t)) out.push(...args);
  }
  return out;
}
