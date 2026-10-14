# project-kickoff: takeover

For the session that continues project-kickoff. Read this first, then `AGENTS.md`, `SKILL.md`, and
`references/stages.md`.

## Where this session lives

The session's working folder is the **umbrella** workspace folder, so it is listed with the
manager in the app sidebar. It works **only inside `project-kickoff/`**: edits, commits and pushes
happen in this repo. The umbrella files (`AGENTS.md`, `README.md`, `docs/`) belong to the manager
session; ask it to update the project-kickoff rows after a big change.

## State (2026-10-07)

- **Repo:** public, `main` only. Installed for Claude Code through a junction in
  `~/.claude/skills/project-kickoff`. Codex and Cursor get **copies** (Windows and WSL) in
  `~/.codex/skills/project-kickoff` and `~/.cursor/skills/project-kickoff`.
- **What it does:**
  - Staged pre-flight: six batched questionnaires (domain, architecture, data, auth, CI, harness).
  - `scripts/render.mjs` renders the project's docs, guardrail hooks and CI from `templates/`.
  - `scripts/preflight.mjs` gives advisory checks (`--strict` exits non-zero).
  - A build-loop checklist runs per feature.
  - Every rule cites a lesson in `references/lessons.md` (99 lessons, anonymized).
- **Last work (2026-10-04):** anonymized for public sharing, README redesigned with readmelyzer,
  `AGENTS.md` with gates added (CLAUDE.md merged into it 2026-10-11).

## Open items, best first

**v2 plan (approved 2026-10-14).** project-kickoff is the product line's product for websites and
systems: the paved road from idea to a real pilot, for your own repo and your own agents. The Factory runs
tickets; a sibling builder will cover mobile apps. Speak their language: owner, `## What you need to do`,
append-only `*.jsonl` ledgers, lesson classes, no speed claim without a measurement. One PR per step,
pr-gate, merge only on the owner's `merge`.

1. **P1 Measure** — done in this branch: `.kickoff/HISTORY.jsonl`, `log.mjs`, `measure.mjs`, `docs/METRICS.md`, L101.
2. **P2 Adopt** — `/project-kickoff adopt` for existing repos: map existing docs, render only what is missing,
   gap report ranked by risk; `status` on a repo with code says "run adopt".
3. **P3 Field fixes** — environment tiers as data (Local/CI/Test/Beta/Prod) with a shared-DB check; Windows-safe
   `.gitattributes` and a CRLF-in-`.sh` check.
4. **P4 Launch track** — `docs/LAUNCH.md` of owner-only blockers from day 1; owner steps validated by a script
   in the `## What you need to do` format.
5. **P5 Build alone or with Crew** — stage 6 builds here, or exports `crew.json` when the Factory is installed.
6. **P6 Learn across projects** — lesson `source` + `class` columns, `retro` mode, a user-level lesson store,
   community lessons by PR; a rule needs 2+ projects.
7. **P7 Opt-in telemetry + profiles** — kickoff's own backend (off by default, show before send, numbers only);
   `python-fastapi-nextjs` and `single-vm-caddy` profiles; README speed promise only after measured ledgers.

**Hook design (issue #2).** The Bash guards are an allowlist, not a shell parser: protected text (destructive
SQL, a real `.env`, a migration path) anywhere in the command blocks it unless the command is built only from
read-only commands (`templates/claude/hooks/_shell.js`). Three review rounds on a parsing design kept finding
new spellings (`bash -cl`, `>|`, `dd of=`, `sort -o`), so do not go back to parsing destinations. Known false
positives (`cp .env backup`, `sed` over SQL text): the owner overrides by hand; add a reader to the list in
`_shell.js` if one keeps recurring.

## Gate

```bash
node --test scripts/preflight.test.mjs scripts/hooks.test.mjs scripts/render.test.mjs scripts/measure.test.mjs
node ~/.claude/skills/readmelyzer/scripts/check-readme.mjs . --public --all-files
```

## Releasing a change

1. Run the gate. The public check must print no `LEAK:` line.
2. Commit and push `main`.
3. Re-sync the copies:
   - **Windows:** `robocopy <repo> %USERPROFILE%\.codex\skills\project-kickoff /MIR /XD .git`,
     and the same for `.cursor`.
   - **WSL:** `rsync -a --delete --exclude .git <repo>/ ~/.codex/skills/project-kickoff/`, and the
     same for `.cursor`.
4. Add a new rule to `references/lessons.md` first, then to the checklist that cites it.

## Boundaries

- **Public repo:** no personal paths, private project or client names, real prompts or logs.
  Examples use invented details with the same problem shape.
- **Old commits** hold pre-anonymization text (no secrets; checked 2026-10-04). Accepted.
