# Harness: what stage 5 generates and why

| File | Type | Guards against | Lesson |
|---|---|---|---|
| `.claude/hooks/block-env-edit.js` | PreToolUse Edit/Write, exit 2 | agent editing a real `.env` | L58 |
| `.claude/hooks/block-destructive-sql.js` | PreToolUse Bash, exit 2 | DROP/TRUNCATE/DELETE-without-WHERE from a shell; skips read-only commands so `truncate` classes and grep patterns no longer false-positive | CRM hook + TAKEOVER §7 |
| `.claude/hooks/service-role-guard.js` | PostToolUse Edit/Write, warn | service-role key outside the allowlisted dirs | L21, L29 |
| `.claude/hooks/migration-number-check.js` | PreToolUse Edit/Write, exit 2 | migration prefix already local or on origin/main | L38 |
| `.claude/agents/quality-gate.md` | sub-agent | shipping without gates, types regen, hygiene, comments, swallowed errors | L39, L63, L66 |
| `.claude/agents/rls-auditor.md` | sub-agent | tables without tenant policy, anon grants/executes not whitelisted | L22, L23 |
| `scripts/gates.mjs` | node script | gate list drift: one source of truth in `docs/KICKOFF.md` | L60, L78 |
| `scripts/worktree-setup.ps1` / `.sh` | script | stale base, node_modules junctions, `.env` copies | L62 |
| `scripts/db-types.mjs` | node script | stale generated types | L39, L40 |
| `.github/workflows/gates.yml` | CI | "works on my checkout"; deploy from working tree | L60, L64 |
| `.github/workflows/keepalive.yml` | CI (free tier only) | DB auto-pause; cron `*/2` trap; empty secrets | L48 |
| `CLAUDE.md` (+ `AGENTS.md` copy) | rules | everything above as prose rules for Codex/Cursor which do not run Claude hooks | — |

Codex and Cursor do not execute Claude Code hooks. For them the same rules live in `CLAUDE.md`/`AGENTS.md`
and the CI workflow is the enforcement. The rls-auditor agent needs the Supabase MCP; without it, run the
three SQL queries in its procedure by hand.

Gaps the CRM never closed and these templates now do: migration collisions (hook), type regeneration
(script + runbook + quality-gate check), broad staging while a worker runs (CLAUDE.md rule + quality-gate
hygiene), migration-applied-before-deploy (runbook + STATE.md table). Preview isolation stays a dashboard
rule in ENV_MATRIX; no local check can see the hosting platform's env scopes.
