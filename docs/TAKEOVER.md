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

Done 2026-10-11: strict preflight and gate-runner fixes (PR #5, issue #1); render end-to-end test (PR #7);
hook bypass fix as an allowlist (issue #2, see below); AGENTS.md as the only instruction file in generated projects, stage 5 ends with `/ready` (issue #3, lesson L100).

1. **Has not been used on a new project since it was anonymized.** The next real kickoff should
   record what was missing in a lesson and a rule.

**Hook design (issue #2).** The Bash guards are an allowlist, not a shell parser: protected text (destructive
SQL, a real `.env`, a migration path) anywhere in the command blocks it unless the command is built only from
read-only commands (`templates/claude/hooks/_shell.js`). Three review rounds on a parsing design kept finding
new spellings (`bash -cl`, `>|`, `dd of=`, `sort -o`), so do not go back to parsing destinations. Known false
positives (`cp .env backup`, `sed` over SQL text): the owner overrides by hand; add a reader to the list in
`_shell.js` if one keeps recurring.

## Gate

```bash
node --test scripts/preflight.test.mjs scripts/hooks.test.mjs scripts/render.test.mjs
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
