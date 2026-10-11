# project-kickoff

Agent skill: staged pre-flight (six batched questionnaires) that renders a project's
docs, guardrails and CI from templates, then a build-loop checklist per feature.
User-facing docs: `README.md`. Agent instructions: `SKILL.md`.

## Layout

- `SKILL.md`: modes, rules, stage loop.
- `references/`: `stages.md` (questionnaire, deliverables, exit checklist per stage), `lessons.md` (99 lessons), `harness.md`, `stack-profiles/`.
- `templates/`: files rendered into a project; `PLACEHOLDERS.md` lists every placeholder.
- `scripts/render.mjs` (answers → files, skips existing), `scripts/preflight.mjs` (advisory checker), `scripts/preflight.test.mjs`.

## Rules

- Every checklist item cites a lesson id in `references/lessons.md`; add the lesson before the rule.
- `preflight.mjs` stays advisory; only `--strict` exits non-zero.
- `render.mjs` never overwrites an existing file without `--force`.
- **This repo is public.** No personal paths, usernames, private project or
  client names, real prompts or logs in any tracked file. Examples and fixtures
  use invented details with the same problem shape. Before every push:
  `node ~/.claude/skills/readmelyzer/scripts/check-readme.mjs . --public --all-files`
  must print no `LEAK:` line.

## Gate

```bash
node --test scripts/preflight.test.mjs
node ~/.claude/skills/readmelyzer/scripts/check-readme.mjs . --public --all-files
```

Copies of this skill live in `~/.codex/skills/project-kickoff` and `~/.cursor/skills/project-kickoff`
(Windows and WSL). Re-sync them after every change.

## Resuming work

Start at `docs/TAKEOVER.md`: state, open items, gate and release steps. The session runs from the umbrella folder and works only inside this repo.

## Resuming work

Start at [docs/TAKEOVER.md](docs/TAKEOVER.md).
