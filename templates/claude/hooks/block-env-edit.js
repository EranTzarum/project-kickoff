#!/usr/bin/env node
// PreToolUse/Edit|Write|Bash: blocks writes to real .env files (they hold live keys)
// while still allowing .env.example templates. Exit 2 = block.
// Bash: any command that names a real .env is blocked unless it is built only from read-only
// commands (cat, grep, head ...) with no output redirect. So `cp`, `dd of=`, `sed -i`, `tee`,
// `bash -c "..."`, `echo > .env` and the like are all caught, however they are spelled.
import { readsOnly, FILE_READERS } from "./_shell.js";

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const { tool_input } = JSON.parse(input || "{}");
  const isEnv = (p) => /(^|\/)\.env(\.[\w.-]+)?$/.test(p) && !p.endsWith(".env.example");
  const path = (tool_input?.file_path ?? "").replaceAll("\\", "/");
  const command = (tool_input?.command ?? "").replaceAll("\\", "/");

  const named = [...command.matchAll(/(?:^|[\s"'=/<>:;|&(])(\.env(?:\.[\w.-]+)?)(?=$|[\s"'<>;|&)])/g)].map((m) => m[1]).find(isEnv);
  const target = isEnv(path) ? path : named && !readsOnly(command, FILE_READERS, true) ? named : null;

  if (target) {
    process.stderr.write(
      `Blocked: ${target} is a real .env file, not a template.\n` +
        `Edit .env.example instead, or ask the user to change .env directly.\n`
    );
    process.exit(2);
  }
  process.exit(0);
});
