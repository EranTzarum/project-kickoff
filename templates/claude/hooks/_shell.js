// Shared by the Bash-side guards. Not a shell parser: it splits a command into simple-command
// segments so a guard can judge each one, instead of trusting the first word of the whole line.
// ponytail: `eval`, variables and `$(...)` inside double quotes are not expanded; upgrade to a
// real shell parser only if a bypass shows up in practice.

// Split on ; & && | || newline ( ) and backtick, outside quotes. `piped` = fed by the previous segment.
export function segments(command) {
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
  return out;
}

const WRITERS = /^(cp|mv|tee|install|dd|ln|rsync|touch|truncate|set-content|add-content|out-file|copy-item|move-item|new-item)$/i;

// Words from every segment that writes (redirect, cp/mv/tee..., sed -i, perl -i): candidate target paths.
export function writeTargets(command) {
  const out = [];
  for (const { text } of segments(command)) {
    const t = text.replace(/\d*>&\d*|\d*>\s*\/dev\/null/g, "");
    const words = t.split(/[\s<>|]+/).filter(Boolean).map((w) => w.replace(/^["']|["']$/g, "").replaceAll("\\", "/"));
    const inPlace = /^(sed|perl)$/i.test(words[0] ?? "") && /\s-\w*i/.test(t);
    if (t.includes(">") || WRITERS.test(words[0] ?? "") || inPlace) out.push(...words);
  }
  return out;
}
