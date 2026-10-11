#!/usr/bin/env node
// PreToolUse/Edit|Write|Bash: blocks writes to real .env files (they hold live keys)
// while still allowing .env.example templates. Exit 2 = block.
// Bash: redirects, cp/mv/tee, sed -i etc. whose target is a real .env file.
import { writeTargets } from "./_shell.js";

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const { tool_input } = JSON.parse(input || "{}");
  const isEnv = (p) => /(^|\/)\.env(\.[\w.-]+)?$/.test(p) && !p.endsWith(".env.example");
  const path = (tool_input?.file_path ?? "").replaceAll("\\", "/");
  const target = isEnv(path) ? path : writeTargets(tool_input?.command ?? "").find(isEnv);

  if (target) {
    process.stderr.write(
      `Blocked: ${target} is a real .env file, not a template.\n` +
        `Edit .env.example instead, or ask the user to change .env directly.\n`
    );
    process.exit(2);
  }
  process.exit(0);
});
