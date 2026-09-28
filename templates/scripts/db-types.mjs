#!/usr/bin/env node
// Regenerates the database TypeScript types after every migration and writes them to every
// target listed below, so no app ever runs on stale types. Run: node scripts/db-types.mjs
// Requires the Supabase CLI (npx supabase) and SUPABASE_ACCESS_TOKEN in the environment.
// If this project uses the Supabase MCP `generate_typescript_types` tool instead, paste its
// output into the same TARGETS — the point is that the list of targets lives in one place.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const PROJECT_ID = process.env.SUPABASE_PROJECT_ID || "{{SUPABASE_PROJECT_ID}}";
const TARGETS = [
  {{TYPES_TARGETS_JS}}
];

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN is not set; refusing to run (would silently produce nothing).");
  process.exit(1);
}
const types = execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["supabase", "gen", "types", "typescript", "--project-id", PROJECT_ID, "--schema", "public"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
);
if (!types.includes("export type Database")) {
  console.error("Generated output does not look like Supabase types; nothing written.");
  process.exit(1);
}
for (const t of TARGETS) {
  writeFileSync(t, types);
  console.log(`wrote ${t} (${types.length} bytes)`);
}
