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
    ["git/gitattributes", ".gitattributes"],
  ],
};

// Shell, CI, Caddy and Docker files break on CRLF, so they are written LF whatever the template's endings on disk.
const LF_ONLY = /(\.(sh|bash|ya?ml)|(^|\/)(Caddyfile|Dockerfile))$/;
const writeOut = (dst, target, text) => writeFileSync(target, LF_ONLY.test(dst) ? text.replace(/\r\n/g, "\n") : text);

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
// Environments are a list of tiers; old answer files get the four tiers the fixed columns implied.
const glob = (u) => (u ? `${u}/**` : undefined);
const tiers = a.environments?.length ? a.environments : [
  { name: "Dev", web: a.devUrl, db: "local", redirects: glob(a.devUrl), realUsers: false, disposable: true },
  { name: "Preview", web: a.previewUrlPattern, branch: "non-main", db: a.testProjectId, redirects: glob(a.previewUrlPattern), realUsers: false, disposable: false },
  { name: "Test", db: a.testProjectId, realUsers: false, disposable: true },
  { name: "Prod", web: a.prodUrl, branch: "main", db: a.supabaseProjectId, redirects: glob(a.prodUrl), realUsers: true, disposable: false },
];
const cell = (v) => (v === undefined || v === null || v === "" ? "-" : String(v));
const yn = (b) => (b ? "yes" : "no");
const LEGACY_SCOPE = { Dev: "dev", Preview: "preview", Prod: "prod" };
const scope = (e, name) => e.tiers?.[name] ?? e[LEGACY_SCOPE[name]] ?? "yes";
const derived = {
  ENV_TIERS: tiers
    .map((t) => `| ${[t.name, t.web, t.branch, t.db, t.api, t.redirects].map(cell).join(" | ")} | ${yn(t.realUsers)} | ${yn(t.disposable)} |`)
    .join("\n"),
  ENV_HEADER: `| KEY | Purpose | ${tiers.map((t) => cell(t.name)).join(" | ")} | Secret? |\n|---|---|${tiers.map(() => "---|").join("")}---|`,
  DATE: new Date().toISOString().slice(0, 10),
  SERVICE_ROLE_DIRS_JS: (a.serviceRoleDirs ?? []).map(quote).join(",\n  "),
  TYPES_TARGETS_JS: (a.typesTargets ?? []).map(quote).join(",\n  "),
  TYPES_TARGETS: (a.typesTargets ?? []).join(", "),
  ROLES_SQL: (a.roles ?? ["owner", "member"]).map((r) => `'${r}'`).join(", "),
  ROLES: (a.roles ?? ["owner", "member"]).join(", "),
  SERVICE_ROLE_DIRS: (a.serviceRoleDirs ?? []).join(", "),
  ENV_KEYS: envKeys.map((e) => `${e.key}=`).join("\n"),
  ENV_ROWS: envKeys
    .map((e) => `| ${e.key} | ${e.purpose ?? ""} | ${tiers.map((t) => scope(e, t.name)).join(" | ")} | ${e.secret ? "yes" : "no"} |`)
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

let adoptMapped = {}, adoptExcluded = [], adopted = false;
const adoptPath = join(root, ".kickoff/adopt.json");
if (existsSync(adoptPath)) {
  try {
    const adopt = JSON.parse(readFileSync(adoptPath, "utf8"));
    if (adopt.mapped !== null && typeof adopt.mapped === "object" && !Array.isArray(adopt.mapped)) {
      adoptMapped = Object.fromEntries(Object.entries(adopt.mapped).filter(([, v]) => typeof v === "string" && v));
      adoptExcluded = Array.isArray(adopt.excluded) ? adopt.excluded.filter((v) => typeof v === "string") : [];
      adopted = true;
    } else {
      console.log("NOTE adopt.json: ignored (mapped is not an object)");
    }
  } catch (e) {
    console.log(`NOTE adopt.json: ignored (${e.message})`);
  }
}

// Rendered text points at the repo's own documents: every mapped deliverable path is replaced by the
// path adopt found, matched as a whole path so `STATE.md` never rewrites `docs/STATE.md`.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mapPaths = (text) => Object.entries(adoptMapped)
  .reduce((t, [from, to]) => t.replace(new RegExp(`(?<![\\w./-])${esc(from)}(?![\\w/-])`, "g"), to), text);
const render = (text) => mapPaths(text.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => (k in values ? values[k] : m)));

let written = 0, skipped = 0;
const writtenByStage = {};
for (const [stage, files] of Object.entries(STAGE_FILES)) {
  if (onlyStage !== null && Number(stage) !== onlyStage) continue;
  writtenByStage[stage] = 0;
  for (const [src, dst] of files) {
    const mappedTo = adoptMapped[dst];
    if (mappedTo) { console.log(`skip   ${dst} (mapped to ${mappedTo})`); skipped++; continue; }
    // adopt owns the manifest and the rows it dropped for this stack; --force does not override either.
    if (adopted && dst === "docs/KICKOFF.md") { console.log(`skip   ${dst} (written by adopt; re-run adopt --write --force)`); skipped++; continue; }
    if (adoptExcluded.includes(dst)) { console.log(`skip   ${dst} (not used by this stack)`); skipped++; continue; }
    const target = join(root, dst);
    if (existsSync(target) && !force) { console.log(`skip   ${dst} (exists)`); skipped++; continue; }
    mkdirSync(dirname(target), { recursive: true });
    const out = render(readFileSync(join(T, src), "utf8"));
    writeOut(dst, target, out);
    const left = out.match(/\{\{[A-Z0-9_]+\}\}/g);
    console.log(`write  ${dst}${left ? `  (unfilled: ${[...new Set(left)].join(" ")})` : ""}`);
    written++;
    writtenByStage[stage]++;
  }
}
for (const [stage, files] of Object.entries(writtenByStage)) {
  // The ledger is best effort: a failure to record never fails the render.
  try { if (files) logEvent(root, force ? "regenerate" : "render", { stage: Number(stage), files }); }
  catch (e) { console.log(`NOTE ledger: ${e.message}`); }
}
// The checker travels with the project so CI can run it without the skill installed.
if (onlyStage === null || onlyStage === 5) {
  const dst = join(root, "scripts/preflight.mjs");
  if (!existsSync(dst) || force) { mkdirSync(dirname(dst), { recursive: true }); copyFileSync(join(SKILL, "scripts/preflight.mjs"), dst); console.log("write  scripts/preflight.mjs"); written++; }
}
if (a.freeTier && (onlyStage === null || onlyStage === 5)) {
  const dst = join(root, ".github/workflows/keepalive.yml");
  if (!existsSync(dst) || force) { mkdirSync(dirname(dst), { recursive: true }); writeOut(dst, dst, render(readFileSync(join(T, "ci/keepalive.yml"), "utf8"))); console.log("write  .github/workflows/keepalive.yml"); written++; }
}
console.log(`\n${written} written, ${skipped} skipped`);
