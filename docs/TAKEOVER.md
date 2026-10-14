# project-kickoff: takeover

For the session that continues project-kickoff. Read this first, then `AGENTS.md`, `SKILL.md`, and
`references/stages.md`.

## Where this session lives

The session's working folder is the **umbrella** workspace folder, so it is listed with the
manager in the app sidebar. It works **only inside `project-kickoff/`**: edits, commits and pushes
happen in this repo. The umbrella files (`AGENTS.md`, `README.md`, `docs/`) belong to the manager
session; ask it to update the project-kickoff rows after a big change.

## State (2026-10-14, `main` @ `7887223`)

- **Repo:** public, `main` only. Installed for Claude Code through a junction in
  `~/.claude/skills/project-kickoff`. Codex and Cursor get **copies** (Windows and WSL) in
  `~/.codex/skills/project-kickoff` and `~/.cursor/skills/project-kickoff`. Windows copies synced
  at `7887223`; WSL copies not synced since before v2.
- **What it does:** staged pre-flight (six batched questionnaires), `render.mjs` renders docs, guardrail
  hooks, CI and `.gitattributes`; `preflight.mjs` gives advisory checks (`--strict` for CI); `adopt.mjs` adopts
  an existing repo; `log.mjs` + `measure.mjs` keep and read an event ledger; `owner-steps.mjs` formats and
  lints owner steps; `docs/LAUNCH.md` lists owner-only blockers from day 1. 106 lessons.
- **Gate:** 10 test files, 72 tests, all passing at `7887223`; public leak check clean.

## Open items, best first

**v2 plan (approved 2026-10-14).** project-kickoff is the product line's product for websites and
systems: the paved road from idea to a real pilot, for your own repo and your own agents. The Factory runs
tickets; a sibling builder will cover mobile apps. Speak their language: owner, `## What you need to do`,
append-only `*.jsonl` ledgers, lesson classes, no speed claim without a measurement. One PR per step,
pr-gate, merge only on the owner's `merge`.

1. **P1 Measure** — merged (#10): `.kickoff/HISTORY.jsonl`, `log.mjs`, `measure.mjs`, `docs/METRICS.md`, L101.
2. **P2 Adopt** — merged (#11): `/project-kickoff adopt` maps existing docs, renders only what is missing,
   ranks gaps by risk; `status` on a repo with code says "run adopt". L102.
3. **P3 Field fixes** — merged (#12): environment tiers as data with a shared real-user DB check; rendered
   `.gitattributes`, LF scripts, CRLF checks. L103, L104.
4. **P4 Launch track** — merged (#13): `docs/LAUNCH.md` (12 items, picked by answers, later answers append);
   `owner-steps.mjs` with a strict lint (Where / Do / expected result; Hebrew labels accepted). L105, L106.
   Not in P4: the stage 2 AI-cost question — no field evidence yet; add it with a lesson when a project supplies one.
5. **P5 Build alone or with Crew — NEXT.** Stage 6 asks per feature: build in kickoff's own loop, or export
   `crew.json` (`id, engine, model, brief_path, write_set, accept, blocked_by` + `validate` from the gates block)
   when the Factory is installed. No code dependency on the Factory; the format is the contract.
6. **P6 Learn across projects** — lesson `source` + `class` columns, `retro` mode, a user-level lesson store,
   community lessons by PR; a rule needs 2+ projects.
7. **P7 Opt-in telemetry + profiles** — known limit from P2: the generated CI installs Python dependencies
   with `pip install -r requirements.txt` or `pip install -e ".[dev]"`; a Poetry/uv/PDM dev group is not
   installed, so a `python -m pytest` gate fails there. The Python profile must pick the dependency manager.
   Then: kickoff's own backend (off by default, show before send, numbers only);
   `python-fastapi-nextjs` and `single-vm-caddy` profiles; README speed promise only after measured ledgers.
   Owner action first: a telemetry backend project.

## How P2–P4 were built (repeat for P5–P7)

- The Factory's crew skill: a feature branch `feature/<slug>` from `main`, `crew init` (then set
  `base_branch` to the feature branch — init writes `main`), three briefs under `.scratch/<slug>/issues/`
  (each under 8,000 characters, with a `## CONSTRAINTS` section), seat matrix approved by the owner, run detached,
  watch with a monitor, review, merge into the feature branch in a temp worktree, re-run validate, push, PR,
  pr-gate (3-round cap), merge only on the owner's word. Then `crew clean --branch` and delete the
  init-generated `crew.json`, `MASTER_PLAN.md`, `ARCHITECTURE.md`, `STATE.md` (kept out of git via
  `.git/info/exclude`).
- Seats that passed first try: agy `claude-opus-5-5-medium` (largest ticket), cursor `composer-2.5` (small
  scripts), claude `sonnet` medium (docs). Cursor is found as `cursor-agent`.
- **Never put the public leak check in a crew gate:** inside crew worktrees it compares the logo with sibling
  folders (the other worktrees) and always fails. Run it on the real checkout after the merge.
- The leak check rejects any email address, even `example.com`; write `name (at) your-domain` instead.
- Shell heredocs with backticks fail in the agent's Bash tool; edit through a script file or the Edit tool.

**Hook design (issue #2).** The Bash guards are an allowlist, not a shell parser: protected text (destructive
SQL, a real `.env`, a migration path) anywhere in the command blocks it unless the command is built only from
read-only commands (`templates/claude/hooks/_shell.js`). Three review rounds on a parsing design kept finding
new spellings (`bash -cl`, `>|`, `dd of=`, `sort -o`), so do not go back to parsing destinations. Known false
positives (`cp .env backup`, `sed` over SQL text): the owner overrides by hand; add a reader to the list in
`_shell.js` if one keeps recurring.

## Gate

```bash
node --test scripts/preflight.test.mjs scripts/hooks.test.mjs scripts/render.test.mjs scripts/measure.test.mjs scripts/render-mapping.test.mjs scripts/adopt.test.mjs scripts/env-tiers.test.mjs scripts/line-endings.test.mjs scripts/owner-steps.test.mjs scripts/launch.test.mjs scripts/to-crew.test.mjs scripts/build-route.test.mjs
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
