# Migration + deploy runbook — {{PROJECT_NAME}}

A migration that is not applied when the app that needs it deploys fails silently in production.
This order is mandatory.

## Naming
`YYYYMMDDHHMM_<snake_name>.sql` (timestamped — no number collisions across branches).
The hook `.claude/hooks/migration-number-check.js` refuses a prefix that already exists locally or on `origin/main`.

## Template
Start from `supabase/migrations/_TEMPLATE.sql`: RLS enabled + tenant policy + `revoke all from anon` on every new table,
`revoke execute ... from anon, public` on every new or re-created function, `x is not null and ...` in CHECKs
(a CHECK passes on NULL), no partial unique index behind an upsert, a DEFAULT on any trigger-assigned NOT NULL column
(otherwise the generated Insert type demands it).

## Order for a change that both adds and removes access
1. **Additive migration** (new columns/functions/grants). Apply live.
2. Regenerate types: `node scripts/db-types.mjs`. Commit every target in `{{TYPES_TARGETS}}`. Typecheck.
3. **Deploy** the app that uses the new objects. Verify in prod.
4. **Revoke-only migration** (drop old grants/paths). Apply live.

## Every migration
- Apply live, then confirm the name in `schema_migrations`.
- Regenerate types (step 2) — never hand-edit generated types. A UI ticket that depends on a new column is dispatched only after types are regenerated.
- Run the `rls-auditor` agent. Run the anon-surface test.
- If a new FK was added, confirm the API schema cache picked it up before using relation-embed queries.
- Record in `STATE.md` §Migrations: repo file name = live name.

## Rollback
Tag the last known-good commit before any risky phase (`git tag known-good-<date>`); rollback is a revert to that tag plus a compensating migration, never a fix-forward under pressure.
