# Kickoff tracker — {{PROJECT_NAME}}

Generated {{DATE}} by the `project-kickoff` skill. Stack profile: `{{STACK_PROFILE}}`.
`node <skill>/scripts/preflight.mjs .` reads the tables below: one row per deliverable, path in backticks.
Advisory only: a MISSING line is a to-do, not a stop sign. `--strict` is for CI.

## Stage 0 — Intake
| Deliverable | Path |
|---|---|
| Stage tracker | `docs/KICKOFF.md` |
| Living state file | `STATE.md` |

## Stage 1 — Domain
| Deliverable | Path |
|---|---|
| Domain model, enums, rules, out of scope | `docs/DOMAIN.md` |

## Stage 2 — Architecture
| Deliverable | Path |
|---|---|
| Tenancy, security, anon surface, integrations, platform limits | `docs/ARCHITECTURE.md` |

## Stage 3 — Database
| Deliverable | Path |
|---|---|
| Migration template | `supabase/migrations/_TEMPLATE.sql` |
| Auth hook + hook-role policy | `supabase/migrations/00000000000000_auth_hook.sql` |
| Types regeneration script | `scripts/db-types.mjs` |
| Migration + deploy runbook | `docs/MIGRATION_RUNBOOK.md` |

## Stage 4 — Auth & environments
| Deliverable | Path |
|---|---|
| Env matrix, redirect URLs, domains | `docs/ENV_MATRIX.md` |
| Env template (keys only) | `.env.example` |

## Stage 5 — Workspace & harness
| Deliverable | Path |
|---|---|
| Rules file | `CLAUDE.md` |
| Hooks config | `.claude/settings.json` |
| Env-edit guard | `.claude/hooks/block-env-edit.js` |
| Destructive SQL guard | `.claude/hooks/block-destructive-sql.js` |
| Service-role guard | `.claude/hooks/service-role-guard.js` |
| Migration number guard | `.claude/hooks/migration-number-check.js` |
| Quality gate agent | `.claude/agents/quality-gate.md` |
| RLS auditor agent | `.claude/agents/rls-auditor.md` |
| Gate runner | `scripts/gates.mjs` |
| Worktree setup | `scripts/worktree-setup.ps1` |
| CI gates | `.github/workflows/gates.yml` |

## Gates
Commands `scripts/gates.mjs` runs, in order. Each must pass in a clean worktree with no `.env`.
```gates
{{GATES}}
```

## Stage 6 — Build loop (per feature, not tracked here)
See `references/stages.md` §6 in the skill, or run `/project-kickoff feature <name>`.

## Owner actions log
Dashboard clicks, secrets, accounts the owner did or still owes. One line each, dated.
- {{DATE}} — (none yet)
