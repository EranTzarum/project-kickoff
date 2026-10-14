#!/usr/bin/env node
// Renders the kickoff templates into a project from an answers JSON.
//   node render.mjs <project-root> <answers.json> [--stage N] [--force]
// Copies each template to its target path, replaces every {{PLACEHOLDER}}, derives the
// composite placeholders (env rows, JS arrays, SQL lists), and refuses to overwrite an
// existing file unless --force. Prints one line per file. No dependencies.
// Logs one `render` (or `regenerate` with --force) event per stage to .kickoff/HISTORY.jsonl.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { logEvent } from "./log.mjs";

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const T = join(SKILL, "templates");

// template (relative to templates/) → target (relative to project root), grouped by stage
const STAGE_FILES = {
  0: [["docs/KICKOFF.md", "docs/KICKOFF.md"], ["docs/STATE.md", "STATE.md"]],
  1: [["docs/DOMAIN.md", "docs/DOMAIN.md"]],
  2: [["docs/ARCHITECTURE.md", "docs/ARCHITECTURE.md"]],
  3: [
    ["db/_TEMPLATE.sql", "supabase/migrations/_TEMPLATE.sql"],
    ["db/auth_hook.sql", "supabase/migrations/00000000000000_auth_hook.sql"],
    ["scripts/db-types.mjs", "scripts/db-types.mjs"],
    ["docs/MIGRATION_RUNBOOK.md", "docs/MIGRATION_RUNBOOK.md"],
  ],
  4: [["docs/ENV_MATRIX.md", "docs/ENV_MATRIX.md"], ["env/.env.example", ".env.example"]],
  5: [
    ["docs/AGENTS.md", "AGENTS.md"],
    ["claude/settings.json", ".claude/settings.json"],
    ["claude/hooks/_shell.js", ".claude/hooks/_shell.js"],
    ["claude/hooks/package.json", ".claude/hooks/package.json"],
    ["claude/hooks/block-env-edit.js", ".claude/hooks/block-env-edit.js"],
    ["claude/hooks/block-destructive-sql.js", ".claude/hooks/block-destructive-sql.js"],
    ["claude/hooks/service-role-guard.js", ".claude/hooks/service-role-guard.js"],
    ["claude/hooks/migration-number-check.js", ".claude/hooks/migration-number-check.js"],
    ["claude/agents/quality-gate.md", ".claude/agents/quality-gate.md"],
    ["claude/agents/rls-auditor.md", ".claude/agents/rls-auditor.md"],
    ["scripts/gates.mjs", "scripts/gates.mjs"],
    ["scripts/worktree-setup.ps1", "scripts/worktree-setup.ps1"],
    ["scripts/worktree-setup.sh", "scripts/worktree-setup.sh"],
    ["ci/gates.yml", ".github/workflows/gates.yml"],
  ],
};

const args = process.argv.slice(2);
const root = resolve(args[0] ?? ".");
const answersPath = args[1];
const force = args.includes("--force");
const stageArg = args.indexOf("--stage");
const onlyStage = stageArg >= 0 ? Number(args[stageArg + 1]) : null;
if (!answersPath) {
  console.error("usage: render.mjs <project-root> <answers.json> [--stage N] [--force]");
  process.exit(1);
}
const a = JSON.parse(readFileSync(answersPath, "utf8"));

// Composite placeholders derived from structured answers so templates stay plain text.
const quote = (s) => JSON.stringify(String(s));
const envKeys = (a.env ?? []).map((e) => (typeof e === "string" ? { key: e } : e));
const derived = {
  DATE: new Date().toISOString().slice(0, 10),
  SERVICE_ROLE_DIRS_JS: (a.serviceRoleDirs ?? []).map(quote).join(",\n  "),
  TYPES_TARGETS_JS: (a.typesTargets ?? []).map(quote).join(",\n  "),
  TYPES_TARGETS: (a.typesTargets ?? []).join(", "),
  ROLES_SQL: (a.roles ?? ["owner", "member"]).map((r) => `'${r}'`).join(", "),
  ROLES: (a.roles ?? ["owner", "member"]).join(", "),
  SERVICE_ROLE_DIRS: (a.serviceRoleDirs ?? []).join(", "),
  ENV_KEYS: envKeys.map((e) => `${e.key}=`).join("\n"),
  ENV_ROWS: envKeys
    .map((e) => `| ${e.key} | ${e.purpose ?? ""} | ${e.dev ?? "yes"} | ${e.preview ?? "yes"} | ${e.prod ?? "yes"} | ${e.secret ? "yes" : "no"} |`)
    .join("\n"),
  GATES: (a.gates ?? []).join("\n"),
  PLATFORM_LIMITS: (a.platformLimits ?? []).map((l) => `- ${l}`).join("\n"),
  ENTITIES: (a.entities ?? []).map((l) => `- ${l}`).join("\n"),
  ENUMS: (a.enums ?? []).map((l) => `- ${l}`).join("\n"),
  DOMAIN_RULES: (a.domainRules ?? []).map((l) => `- ${l}`).join("\n"),
  GLOSSARY: (a.glossary ?? []).map((l) => `- ${l}`).join("\n"),
  IDEMPOTENCY: (a.idempotency ?? []).map((l) => `- ${l}`).join("\n"),
  OUT_OF_SCOPE: (a.outOfScope ?? []).map((l) => `- ${l}`).join("\n"),
  INTEGRATIONS: (a.integrations ?? ["none"]).map((l) => `- ${l}`).join("\n"),
  ANON_SURFACE: (a.anonSurface ?? ["none"]).join(", "),
  OAUTH_PROVIDERS: (a.oauthProviders ?? ["none"]).join(", "),
  PEER_READ_PATHS: a.peerReadPaths ?? "none yet",
  IDENTITY_FIELDS: a.identityFields ?? "none yet",
  SIZE_BUDGETS: a.sizeBudgets ?? "defaults; raise deliberately",
  LANGS: Array.isArray(a.langs) ? a.langs.join(", ") : (a.langs ?? "en"),
};
// Flat string answers win over derived values only when the answer key matches a placeholder name.
const values = { ...derived };
for (const [k, v] of Object.entries(a)) {
  const key = k.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
  if (typeof v === "string" || typeof v === "number") values[key] = String(v);
}

const render = (text) => text.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => (k in values ? values[k] : m));

let written = 0, skipped = 0;
const writtenByStage = {};
for (const [stage, files] of Object.entries(STAGE_FILES)) {
  if (onlyStage !== null && Number(stage) !== onlyStage) continue;
  writtenByStage[stage] = 0;
  for (const [src, dst] of files) {
    const target = join(root, dst);
    if (existsSync(target) && !force) { console.log(`skip   ${dst} (exists)`); skipped++; continue; }
    mkdirSync(dirname(target), { recursive: true });
    const out = render(readFileSync(join(T, src), "utf8"));
    writeFileSync(target, out);
    const left = out.match(/\{\{[A-Z0-9_]+\}\}/g);
    console.log(`write  ${dst}${left ? `  (unfilled: ${[...new Set(left)].join(" ")})` : ""}`);
    written++;
    writtenByStage[stage]++;
  }
}
for (const [stage, files] of Object.entries(writtenByStage)) {
  if (files) logEvent(root, force ? "regenerate" : "render", { stage: Number(stage), files });
}
// The checker travels with the project so CI can run it without the skill installed.
if (onlyStage === null || onlyStage === 5) {
  const dst = join(root, "scripts/preflight.mjs");
  if (!existsSync(dst) || force) { mkdirSync(dirname(dst), { recursive: true }); copyFileSync(join(SKILL, "scripts/preflight.mjs"), dst); console.log("write  scripts/preflight.mjs"); written++; }
}
if (a.freeTier && (onlyStage === null || onlyStage === 5)) {
  const dst = join(root, ".github/workflows/keepalive.yml");
  if (!existsSync(dst) || force) { mkdirSync(dirname(dst), { recursive: true }); writeFileSync(dst, render(readFileSync(join(T, "ci/keepalive.yml"), "utf8"))); console.log("write  .github/workflows/keepalive.yml"); written++; }
}
console.log(`\n${written} written, ${skipped} skipped`);
