# {{PROJECT_NAME}} — agent rules (AGENTS.md)

{{ONE_LINER}} Stack profile: `{{STACK_PROFILE}}`. Read `STATE.md` first, then `docs/ARCHITECTURE.md`.
Reasoning (why) lives in the vault at `{{VAULT_PATH}}`; this file holds rules (what to always/never do). Never duplicate one into the other.

## Gates (must pass before anything merges; run `node scripts/gates.mjs`)
```
{{GATES}}
```
A gate is only real if it passes in a clean worktree with no `.env`. Live-DB suites skip, not fail, without credentials.

## Tenant isolation (non-negotiable)
- Every tenant table has `{{TENANT_KEY}}` + RLS scoped to the `{{JWT_CLAIM}}` JWT claim. New tables ship their policies in the same migration. Run the `rls-auditor` agent after any schema change.
- Service-role key only in: {{SERVICE_ROLE_DIRS}}. Nothing else.
- Anon reads only through the whitelisted surface in `docs/ARCHITECTURE.md` §3. Extend it column by column, never widen a view for convenience.
- Every new or re-created function: `revoke execute ... from anon, public` in the same migration.

## Data model
- Lifecycle enums in `docs/DOMAIN.md` are frozen. Renaming a column, enum value or integration payload shape needs explicit owner approval and updates every consumer in the same change.
- Migrations: timestamped names, `supabase/migrations/_TEMPLATE.sql` shape, `docs/MIGRATION_RUNBOOK.md` order (additive → deploy → revoke). Regenerate types after every migration with `node scripts/db-types.mjs`; never hand-edit generated types.
- Acceptance for data transforms and imports = invariants (inputs = outputs + rejected), never a count the code under test produced.

## Code
- Strict TypeScript, no bare `any`. Every new function/component/complex block/DB query carries a descriptive comment.
- Every database/API call checks its `error` and surfaces it (toast/log). Silent success on failure is the house bug class. No swallowed catch blocks.
- Every user-visible string goes through the i18n dictionary in every language ({{LANGS}}); logical layout utilities only (`ms-`/`me-`/`text-start`), never `ml-`/`mr-`/`text-left`.
- Mobile-first: {{PRIMARY_USER}}. Tap targets ≥ 44 px; tables collapse to cards on small screens. A layout change is done when a mobile-viewport screenshot is checked, not when typecheck passes.
- Guard every `.in()` / list filter against an empty array before sending it.
- New files under ~500 lines; split an existing large file only while already reworking it.

## Workspace
- Each writing agent or parallel session gets its own worktree via `scripts/worktree-setup.ps1` (fetches `origin/main` first; never junctions `node_modules`). Never `git add -A` while any worker is mid-edit.
- Production deploys from `main` only, via {{DEPLOY_CMD}}. Never deploy from a working tree.
- Never commit secrets or `.env` files. No raw `DROP`/`TRUNCATE`/`DELETE` without `WHERE` via a shell command.
- Shell: state PowerShell vs Git Bash vs WSL in every command block. This repo is {{LINE_ENDINGS}}; regex checks must tolerate a trailing `\r`.
- Delegated workers read their ticket from a file, never from a shell-quoted string. Workers never spawn workers. A worker's "tests passed" is re-run by the orchestrator when the worker's sandbox cannot run the toolchain.

## Session hygiene
- Update `STATE.md` (done / in flight / next / mistakes already made) at the end of every session and at ~70 % quota.
- A real decision (choice between alternatives, with a reason) goes to the vault via `vault-capture`; run `vault-sync` before closing.
- Never merge to `main` without the owner's explicit instruction. Deliver a branch.

## Claude Code only
This file is the only instruction file; Codex, Cursor and Claude Code all read it. Claude Code also runs hooks that enforce part of the rules above. Codex and Cursor do not run hooks, so for them these rules and the CI gates are the enforcement.
- `.claude/hooks/service-role-guard.js` warns when the service-role key appears outside the allowed directories.
- `.claude/hooks/block-env-edit.js` blocks writes to a real `.env`; `block-destructive-sql.js` blocks raw destructive SQL from a shell; `migration-number-check.js` refuses a taken migration prefix.
- Sub-agents `quality-gate` and `rls-auditor` live in `.claude/agents/`.
