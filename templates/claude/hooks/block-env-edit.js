#!/usr/bin/env node
// PreToolUse/Edit|Write: blocks edits to real .env files (they hold live keys)
// while still allowing .env.example templates. Exit 2 = block.
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const { tool_input } = JSON.parse(input || "{}");
  const path = (tool_input?.file_path ?? "").replaceAll("\\", "/");

  if (/(^|\/)\.env(\.[\w.-]+)?$/.test(path) && !path.endsWith(".env.example")) {
    process.stderr.write(
      `Blocked: ${path} is a real .env file, not a template.\n` +
        `Edit .env.example instead, or ask the user to change .env directly.\n`
    );
    process.exit(2);
  }
  process.exit(0);
});
