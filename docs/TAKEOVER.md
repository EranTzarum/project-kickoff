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

1. **Issue #2: guardrail hooks can be bypassed.** Reproduced; found by an outside second-opinion review.
   - The SQL hook (`templates/.../block-destructive-sql.js`) skips the whole command when its first
     word looks read-only: `echo ready; psql -c "DROP TABLE accounts"` passes.
   - The env-edit and migration hooks match only `Edit|Write` (`templates/claude/settings.json`), so
     shell writes (redirection, `cp`, `sed -i`) bypass them.

   Fix:
   - Scan every command segment (split on `;`, `&&`, `||`, `|` and newlines; respect quotes).
   - Add Bash-side checks for env and migration paths.
   - Add tests for the bypasses above.
2. **Issue #2, second part: `preflight --strict` passes an incomplete project.** It accepts a
   manifest with missing items and an empty gate list. `--strict` should fail on both; add tests.
3. **No end-to-end test of `render.mjs`.** Only `preflight` has tests. Add a render test with
   `templates/answers.example.json` that checks the files written and that existing files are not
   overwritten without `--force`.
4. **Has not been used on a new project since it was anonymized.** The next real kickoff should
   record what was missing in a lesson and a rule.

## Gate

```bash
node --test scripts/preflight.test.mjs scripts/hooks.test.mjs
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
