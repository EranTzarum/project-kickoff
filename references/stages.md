# Stages

Each stage: purpose → questionnaire (one batched call, defaults from the stack profile marked *(default)*)
→ deliverables rendered from `templates/` → exit checklist (every item cites `lessons.md`).
Ask nothing that the profile or an earlier answer already settles.

---

## Stage 0 — Intake

Purpose: fix the facts every later stage derives from, and set up the tracker so nothing lives only in chat.

Questionnaire (one call):
1. Project name + one-line purpose + who the primary user is and on what device. *(default: agent in the field on a phone)* — L2
2. UI languages, default first; RTL? *(default: en; no RTL)* — L3, L79
3. Country of the business (drives payment provider, legal text, SMS/phone formats). *(no default: always ask)* — L1
4. Stack profile: pick from `references/stack-profiles/`. *(default: supabase-react-vercel)*
Second call only if needed:
5. Who codes: orchestrator plans + workers implement *(default)*, or single agent end to end? Which worker sandboxes can run npm/tests? — L6, L72
6. What "v1 done" means, in one sentence the owner would sign.

Deliverables: `docs/KICKOFF.md` (tracker), `STATE.md`, and optionally a notes-vault `Projects/<name>/Overview.md` via `vault-capture` (Claude Code, when installed).

Exit checklist:
- [ ] Tracker and STATE.md exist; STATE.md has a "mistakes already made" section — L69, L70
- [ ] Tooling bring-up listed as owner actions: CLI auth (gh, hosting, DB), shell stated, toolchain (jq/rg) — L4, L5
- [ ] Paid tools' quota/billing model recorded once — L7
- [ ] Division of labor written in AGENTS.md §Workspace — L6, L91
- [ ] Event ledger started: `.kickoff/project.json` + `.kickoff/HISTORY.jsonl` (render writes them; log `stage_start` for each stage and every owner action) — L101
- [ ] Existing repo: adopted first (`adopt` dry run reviewed, then `--write`); no parallel docs created — L102

---

## Stage 1 — Domain and data model

Purpose: get the owner's vocabulary, entities, enums and rules written BEFORE any SQL. This was the second most expensive gap on the CRM.

Questionnaire (one call):
1. Entities (one line each) and who owns a row. *(no default)*
2. Roles vocabulary. *(default: owner, member)*
3. Lifecycle enums per entity, each value's meaning; publish vs lifecycle vs archive kept separate. *(default: draft/active/archived)* — L14, L15
4. Domain rules with numbers (bands, thresholds, asymmetries, time windows). *(no default)* — L12
Second call:
5. Data conventions: units, shorthand ("3.5" = 3,500,000), date/phone formats, what makes two records "the same". — L10, L11, L13
6. Import/sync sources and their natural keys; which source timestamp becomes `created_at`. — L16, L17, L42
7. Out of scope for v1.

Deliverables: `docs/DOMAIN.md`.

Exit checklist:
- [ ] Every enum listed with distinct meaning; marked FROZEN — L14, L15
- [ ] Every domain rule has a number and a decider — L12
- [ ] Dedup keys enumerated against real examples with the owner — L10, L11; normalisation ruled out before calling a link infeasible — L18
- [ ] Idempotency key + non-partial unique index per import path, parent and children — L41, L42
- [ ] A realistic seed sample planned before UI polish — L19
- [ ] Error-to-message mapping keyed by specific code, not buckets — L20

---

## Stage 2 — Architecture and security

Purpose: decide tenancy, privileged access, the anonymous surface, frozen contracts and platform limits while they are still cheap to decide.

Questionnaire (one call):
1. Tenancy model: tenant root table, tenant key column, JWT claim. *(default: agencies / agency_id / agency_id)*
2. Which directories may hold the service-role key, and for what single purpose each. *(default: apps/api/src/admin/ only)* — L21, L29
3. Anonymous surface: which views/RPCs anon may read or call, column by column. *(default: none until a public page is scoped)* — L22, L23
4. Integrations whose payload/enum shape must be frozen (extensions, feeds, webhooks). *(default: none)* — L15, L27
Second call:
5. Peer-data read paths: which colleague rows are visible, via policy or DEFINER RPC. — L24
6. Platform plan tier per service (hosting, DB, mail) — the limits sheet is copied from the profile and checked. — L25, L47
7. Size budgets: JSON body, uploads, canvas payloads, function timeouts. — L26

Deliverables: `docs/ARCHITECTURE.md`.

Exit checklist:
- [ ] Identity fields stamped server-side; threat model per client-writable field — L21
- [ ] Revoke-on-create rule for functions and tables written — L22, L23, L49
- [ ] Platform limits sheet reviewed against the purchased plan (crons, durations, body size) — L25
- [ ] Canonical domain decided; allowlists read it from config — L27, L28
- [ ] Money/auth-signature paths name their vetted library — L30
- [ ] Untrusted-input parsers audited for CVE channel — L31
- [ ] Multi-app hosting routing defined — L32
- [ ] External API auth mapped per host — L33; bulk pulls run server-side by script — L34
- [ ] Risky UI mechanics and sync designs spiked, not assumed — L35, L36

---

## Stage 3 — Database setup

Purpose: make the first migration correct and every later one boring.

Questionnaire (one call):
1. Production project ref, and a SEPARATE test project ref. *(default: create both)* — L46
2. Migration naming: timestamped *(default)* or reserved numbers?— L38
3. Types regeneration targets (one path per app). *(default: apps/web/src/lib/database.types.ts, apps/api/src/lib/database.types.ts)* — L39, L40
4. Backup plan / plan tier for prod. *(default: decide before first real row)* — L47

Deliverables: `supabase/migrations/_TEMPLATE.sql`, `supabase/migrations/00000000000000_auth_hook.sql`, `scripts/db-types.mjs`, `docs/MIGRATION_RUNBOOK.md`.

Exit checklist:
- [ ] Auth hook migration includes the hook role's own read policy — L37
- [ ] Template: RLS + tenant policy + revoke anon on tables; revoke execute on functions; CHECK not-null; DEFAULT on trigger-assigned NOT NULL — L43, L44, L49
- [ ] `migration-number-check.js` in settings; runbook order additive → deploy → revoke — L38, L66, L67
- [ ] Types regen wired to "migration applied"; UI tickets wait for it — L39, L40
- [ ] Upsert statements tested against their unique index in the same change — L41; schema cache confirmed after a new FK — L45
- [ ] Keepalive (if free tier) daily, failing fast on empty secrets — L48
- [ ] Test project + teardown helper + test-credential helper planned — L46

---

## Stage 4 — Auth and environments

Purpose: the auth/config gap the owner named as the most expensive. Nothing here is code; it is dashboard clicks, done before the first invite.

Questionnaire (one call):
1. Origins: dev (pinned port), preview pattern, canonical prod domain. *(default: http://localhost:5173, https://*-<team>.vercel.app, tbd)* — L27, L51
2. Custom SMTP provider for auth mail. *(default: Resend)* — L52
3. OAuth providers to verify, if any. *(default: none)* — L54
4. Does Preview share the production DB? If yes, Preview gets no prod secrets. *(default: separate test DB for Preview)* — L56
5. Environment tiers: which tiers exist (Local, CI, Test, Beta, Prod …), and for each one the web host, branch, database, API origin and auth redirects; which hold real users and which are disposable. *(default: Dev / Preview / Test / Prod derived from the URLs and project refs)* — L103

Deliverables: `docs/ENV_MATRIX.md`, `.env.example`.

Exit checklist (owner actions, listed in the tracker log):
- [ ] Redirect URLs registered per env; dev port pinned — L50, L51
- [ ] SMTP configured before the first invite — L52
- [ ] Invite → set-password → sign-in walked by a non-technical tester in Preview — L50, L53
- [ ] OAuth verification submitted when scoped; one browser smoke test per flow — L54, L55
- [ ] Env matrix set in the hosting dashboard; bot git author valid — L56, L57
- [ ] Local permission/settings files gitignored — L58
- [ ] tsconfig target matches the hosting runtime; CI build before first deploy — L59
- [ ] Every tier is a row in docs/ENV_MATRIX.md; the real-user database is production-grade (no resets, backups on, runbook migrations) and shared with no disposable tier — L103

---

## Stage 5 — Workspace and harness

Purpose: guardrails that on the CRM landed in week 1 and then never grew until week 11. Generate them all now.

Questionnaire (one call):
1. Gate commands, in order (typecheck, unit tests per workspace, extension tests, build). *(default from profile)* — L60, L78
2. Deploy command / rule. *(default: push to main → hosting git integration)* — L64, L65
3. Worker platforms in use (Claude, Codex, Cursor) and which can run npm. — L72, L73
4. Line endings (CRLF/LF) and shell for command blocks. *(default: CRLF on Windows, PowerShell + Git Bash)* — L5

Deliverables: `AGENTS.md` (the only instruction file; Claude-only rules in a section inside it), `.claude/settings.json`, four hooks, two agents, `scripts/gates.mjs`, `scripts/worktree-setup.ps1|.sh`, `.github/workflows/gates.yml` (+ `keepalive.yml` on free tier).

Exit checklist:
- [ ] Every gate passes in a clean worktree with no `.env` — L60, L61
- [ ] Worktree script fetches first, never junctions — L62
- [ ] No `git add -A` while a worker runs; gates before push — L63
- [ ] Deploy from git only, `main` only — L64, L65
- [ ] No-swallowed-errors rule + migration-applied deploy step — L66, L67
- [ ] One living STATE.md; other status docs superseded; rule docs updated with the feature — L68, L69
- [ ] Workers read tickets from files; absolute cwd; stdin closed — L71
- [ ] Model-per-role policy fixed — L74; plugin overhead audited — L75; dead branches deleted or tagged — L77
- [ ] One instruction file, `AGENTS.md`; no `CLAUDE.md` rendered. Graphify, the standard doc set and the always-on tool checks are `/ready`'s job, not stage 5 — L76, L100
- [ ] The stage 5 receipt lists the loading check as an owner action (Claude Code v2.1.277 or newer, no `CLAUDE.md` in the project or a parent; else a `CLAUDE.md` containing only `@AGENTS.md`, or an `@AGENTS.md` line added to an existing one) and ends with one line: run `/ready` — L100
- [ ] RTL lint rule and shared primitives, if RTL — L79
- [ ] Design tokens approved by the owner before UI waves — L80
- [ ] Tickets reference a shared context file, seats tracked — L81
- [ ] .gitattributes pins *.sh, *.yml, Caddyfile and Dockerfile to LF; no CRLF shell script — L104

---

## Stage 6 — Build loop (recurring, per feature)

Not a one-time stage. Print on `/project-kickoff feature <name>` with the feature name filled in.

1. **Design / grill.** Acceptance criteria as invariants the owner can read, including visibility edge cases. — L9, L82
2. **Ticket file** (`.tickets/<feature>-<n>.md`): id, READ FIRST, write scope (pre-authorising backward-compatible edits to shared components), off-limits, contract if split, verify command, severity flag. Workers never spawn workers. — ticket anatomy, L8, L71, L81, L99
3. **Own worktree** via `scripts/worktree-setup.*`; tag `known-good-<date>` before a risky phase. — L62, L87
4. **Build**, typecheck after each meaningful edit; guard empty list filters; no swallowed errors. — L86, L88
5. **Gates** in the worktree: `node scripts/gates.mjs`. Re-run yourself if the worker's sandbox cannot. Tests are hermetic and never gated on a rate-limited external provider; a passing test is the spec until the owner says otherwise. — L60, L72, L85, L92, L95
6. **Verify** with a different model family, given the original task + diff + criteria, never the worker's summary; trust the filesystem over any report. — L91, L98
7. **Schema changed?** Runbook: additive → types regen → deploy → revoke; `rls-auditor`; anon-surface test; contract test for every new RPC. — L39, L67, L84
8. **Data changed?** Spot-check N real records end to end; invariants, not counts; load-test fetch changes against the full dataset. — L83, L93, L94
9. **Checkpoint**: check hard-refresh before treating a "missing" deployed feature as a bug (L96); push the branch for review, update `STATE.md` (done / in flight / next / mistakes), `vault-capture` any real decision. Never merge to main without instruction. — L69, L97
10. **Budgets**: identical-ticket retries ≤ 2; token/turn cap on any open-ended mandate; checkpoint at ~70 % quota. — L89, L90, L69
