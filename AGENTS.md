# project-kickoff

Agent skill: staged pre-flight (six batched questionnaires) that renders a project's
docs, guardrails and CI from templates, then a build-loop checklist per feature.
User-facing docs: `README.md`. Agent instructions: `SKILL.md`.

## Layout

- `SKILL.md`: modes, rules, stage loop.
- `references/`: `stages.md` (questionnaire, deliverables, exit checklist per stage), `lessons.md` (108 lessons), `harness.md`, `stack-profiles/`.
- `templates/`: files rendered into a project; `PLACEHOLDERS.md` lists every placeholder.
- `scripts/render.mjs` (answers → files, skips existing), `scripts/preflight.mjs` (advisory checker), `scripts/preflight.test.mjs`, `scripts/hooks.test.mjs`, `scripts/render.test.mjs`, `scripts/log.mjs` + `scripts/measure.mjs` (event ledger and metrics, `docs/METRICS.md`), `scripts/measure.test.mjs`, `scripts/adopt.mjs` (adopt an existing repo), `scripts/owner-steps.mjs` (owner steps in one format, `--lint`), `scripts/to-crew.mjs` (tickets to crew.json), `scripts/build-route.mjs` (Crew detection + route event), `scripts/lessons.mjs` (lessons lint), `scripts/retro.mjs` (retro and user lesson store), `CONTRIBUTING.md`.

## Rules

- Every checklist item cites a lesson id in `references/lessons.md` and `lessons.mjs --lint` passes; add the lesson before the rule.
- `preflight.mjs` stays advisory; only `--strict` exits non-zero.
- `render.mjs` never overwrites an existing file without `--force`.
- **This repo is public.** No personal paths, usernames, private project or
  client names, real prompts or logs in any tracked file. Examples and fixtures
  use invented details with the same problem shape. Before every push:
  `node ~/.claude/skills/readmelyzer/scripts/check-readme.mjs . --public --all-files`
  must print no `LEAK:` line.

## Gate

```bash
node --test scripts/preflight.test.mjs scripts/hooks.test.mjs scripts/render.test.mjs scripts/measure.test.mjs scripts/render-mapping.test.mjs scripts/adopt.test.mjs scripts/env-tiers.test.mjs scripts/line-endings.test.mjs scripts/owner-steps.test.mjs scripts/launch.test.mjs scripts/to-crew.test.mjs scripts/build-route.test.mjs scripts/lessons.test.mjs scripts/retro.test.mjs
node scripts/lessons.mjs --lint
node ~/.claude/skills/readmelyzer/scripts/check-readme.mjs . --public --all-files
```

Copies of this skill live in `~/.codex/skills/project-kickoff` and `~/.cursor/skills/project-kickoff`
(Windows and WSL). Re-sync them after every change.

## Resuming work

Start at `docs/TAKEOVER.md`: state, open items, gate and release steps. The session runs from the umbrella folder and works only inside this repo.
