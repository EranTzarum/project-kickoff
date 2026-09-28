#!/usr/bin/env node
// PostToolUse/Edit|Write: warns when service_role usage shows up outside the allowlisted
// directories (service_role bypasses RLS). Keep ALLOWLIST in sync with docs/ARCHITECTURE.md §2.
const ALLOWLIST = [
  {{SERVICE_ROLE_DIRS_JS}}
];

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const { tool_input } = JSON.parse(input || "{}");
  const path = (tool_input?.file_path ?? "").replaceAll("\\", "/");
  const content = tool_input?.content ?? tool_input?.new_string ?? "";

  const isSource = /\.(ts|tsx|js|mjs|cjs|py|sql)$/.test(path) && !/\.(test|spec)\./.test(path);
  const allowed = ALLOWLIST.some((dir) => path.includes(dir));
  const mentionsServiceRole = /service_role|SERVICE_ROLE_KEY/.test(content);

  if (isSource && !allowed && mentionsServiceRole) {
    process.stdout.write(
      `Warning: ${path} references the service-role key outside the allowlist (${ALLOWLIST.join(", ")}). ` +
        `That bypasses tenant isolation — move the logic into an allowlisted directory or use the request-scoped client.\n`
    );
  }
  process.exit(0);
});
