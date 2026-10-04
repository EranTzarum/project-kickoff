---
name: project-kickoff
description: Staged pre-flight for building a new site or system with AI agents — intake, domain model, architecture/security, database, auth/environments, workspace/harness — then a recurring build-loop checklist. Asks one batched questionnaire per stage, generates the project's docs and agent harness from templates, and runs an advisory checker. Use when starting a new project, when the user says "kickoff", "new project", "set up the project", or "/project-kickoff status" mid-project. Lessons come from a three-month multi-tenant CRM build (references/lessons.md).
---

# Project Kickoff

Turns "I want to build X" into a prepared workspace before the first line of product code, then keeps a stage checklist visible while building. Every checklist item cites a lesson id (`L<n>`) in `references/lessons.md`; when the user asks *why*, quote that lesson.

Base directory of this skill: the folder holding this file. Templates are in `templates/`, references in `references/`, the checker in `scripts/preflight.mjs`.

## Modes

- `/project-kickoff` or "kickoff" — run the stages in order, starting from the first stage whose deliverables are missing.
- `/project-kickoff status` — run the checker only, print the stage table, change nothing.
- `/project-kickoff stage <n>` — re-run one stage's questionnaire and regenerate its deliverables.
- `/project-kickoff feature <name>` — print the build-loop checklist (stage 6) filled in for one feature.

## Rules (all modes)

1. **Read `references/stages.md` first**, then the stack profile the user picks (`references/stack-profiles/*.md`). Do not improvise questions; the stage file holds them.
2. **One batched questionnaire per stage.** In Claude Code use `AskUserQuestion` (≤4 questions per call; a second call only if an answer opens a branch). In Codex or Cursor, where no question tool exists, print the same questions as a numbered list with the profile defaults marked and stop until the user answers. Never ask one question at a time.
3. **Defaults are pre-filled from the profile** and marked "(profile default)". Silence on a question means the default.
4. **Advisory gates.** After writing a stage's deliverables run `node <skill>/scripts/preflight.mjs <project-root>`, show its stage line, then continue. Never block on a MISSING line; list it and move on. Only `--strict` (CI) fails.
5. **Generate, do not hand-write.** Collect the stage answers into `<project>/.kickoff/answers.json` (shape: `templates/answers.example.json`; keys are camelCase placeholder names, lists for the composite fields), then run `node <skill>/scripts/render.mjs <project-root> .kickoff/answers.json --stage <n>`. The renderer copies each template to its target, fills every `{{PLACEHOLDER}}` (`templates/PLACEHOLDERS.md`), derives the composite ones, and prints any left unfilled. Fix unfilled ones by adding the answer, never by editing the rendered file.
6. **Never overwrite a deliverable that already exists.** `render.mjs` skips existing files; pass `--force` only when the user chose "regenerate". Commit `.kickoff/answers.json` (it holds no secrets) so `stage <n>` can re-render later.
7. **No git, no deploy, no secrets.** The skill writes files. Committing, pushing, deploying and filling real `.env` values are the user's actions; list them under "Owner actions" at the end of each stage.
8. **Notes vault (optional).** At the end of stage 0 call the `vault-capture` skill to create `Projects/<name>/Overview.md` (if the vault skills exist on this machine). At the end of the run call `vault-sync`. Skip silently where those skills are absent (Codex/Cursor without the vault).
9. **Operating model:** one approval gate per stage, no per-step permission prompts, no progress narration, finish each stage with a one-screen receipt: deliverables written, checker line, owner actions.

## Stage loop

For each stage `n` in `references/stages.md`, in order:

1. Run the checker. If the stage is already READY and the mode is not `stage <n>`, skip to the next stage.
2. Ask the stage's questionnaire (rule 2), defaults from the profile.
3. Render the stage's deliverables from `templates/` (rule 5, rule 6).
4. Run the checker again; print the stage line.
5. Print the stage receipt: files written, MISSING items (if any), owner actions (dashboard clicks, secrets to set, accounts to create).
6. Continue to the next stage without asking permission.

After stage 5, print the stage 6 build-loop checklist once and stop. The project is ready for its first feature.

## Where things go in the target project

```
docs/KICKOFF.md            stage tracker + deliverable manifest (the checker reads this)
docs/DOMAIN.md             entities, roles, enums, domain rules, out of scope
docs/ARCHITECTURE.md       tenancy, security model, anon surface, integration contracts, platform limits
docs/ENV_MATRIX.md         env vars × Prod/Preview/Dev, redirect URLs, domains
docs/MIGRATION_RUNBOOK.md  additive → deploy → revoke order, types regen, apply checklist
STATE.md                   the one living "where are we" file
CLAUDE.md + AGENTS.md      rules (what to always/never do); AGENTS.md is the identical copy Codex/Cursor read
scripts/preflight.mjs      a copy of the checker so CI runs it without the skill installed
.kickoff/answers.json      the stage answers the renderer consumed (re-render any stage from it)
.env.example               every key from ENV_MATRIX, no values
supabase/migrations/       (profile-specific) migration template + auth hook recipe
.claude/settings.json, .claude/hooks/*.js, .claude/agents/*.md
scripts/worktree-setup.*, scripts/db-types.mjs, scripts/gates.mjs
.github/workflows/gates.yml
```

## Checker output contract

```
STAGE 0 INTAKE: READY
STAGE 1 DOMAIN: MISSING — docs/DOMAIN.md (placeholder {{ENTITIES}} left)
STAGE 3 DATABASE: READY
CHECK env: .env.example key FOO_BAR not in docs/ENV_MATRIX.md
CHECK migrations: 0007_x.sql creates function f() without a revoke from anon
```

Exit code is 0 unless `--strict` was passed and something is MISSING or a CHECK failed.

## Stage 6 — the build loop (recurring)

Printed after stage 5 and on `/project-kickoff feature <name>`; full text in `references/stages.md` §6. Short form:

design/grill → ticket (write scope + acceptance **command** + files to read + off-limits) → own worktree → build → gates in the worktree → cross-model verify (different family, given the original task not the worker's summary) → migration runbook if schema changed → `STATE.md` update → `vault-sync` → owner reviews branch, owner merges. Checkpoint state to disk at ~70 % of quota, not at 95 %.
