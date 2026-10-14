# Adopt mode

For a repo that already exists. A fresh kickoff would write a second set of docs next to the real ones.
Adopt maps what is there, writes one manifest, and lists what is missing, ranked by risk (L102).

## When to use it

- The repo has code (`package.json`, `pyproject.toml`, `go.mod`, `src/` …) and no `docs/KICKOFF.md`.
- `preflight.mjs` says `existing project detected: <marker>; run /project-kickoff adopt`.

A new, empty project uses the normal kickoff instead.

## The two steps

1. **Dry run.** `node <skill>/scripts/adopt.mjs <project-root>` writes nothing. It prints:
   - `STACK:` and `PROFILE:` — what it detected and the stack profile it picked.
   - `PRESENT <path>` — a deliverable that already exists at its own path.
   - `MAP <deliverable> -> <existing path>` — a deliverable found under another name.
   - `GAP high|medium|low: <text>` — see below.
2. **Write.** Show the report, ask once whether to write the manifest, then run
   `node <skill>/scripts/adopt.mjs <project-root> --write`. It refuses if `docs/KICKOFF.md` exists;
   `--force` overrides that.

Then continue with the normal stage loop. Stages whose deliverables are mapped or present are skipped by
the checker. The rest are rendered.

## What it writes

Exactly two files, and no other:

- `docs/KICKOFF.md` — the manifest. Its rows point at the repo's existing documents.
- `.kickoff/adopt.json` — `{ v, mapped, stack, profile, gaps }`.

It also logs an `adopt` event to the ledger (`docs/METRICS.md`). It never edits an existing document,
config or script.

`.kickoff/adopt.json`:

| field | meaning |
|---|---|
| `v` | schema version |
| `mapped` | deliverable → existing path, for every `MAP` line |
| `stack` | the detected stack |
| `profile` | the stack profile name |
| `gaps` | the gap lines, each with its risk |

## Aliases

The deliverable is on the left. The first existing file in the list wins.

| Deliverable | Existing file it maps from |
|---|---|
| `docs/DOMAIN.md` | `DOMAIN.md`, `docs/domain.md`, `docs/DOMAIN_MODEL.md`, `docs/domain-model.md`, `docs/data-model.md` |
| `docs/ARCHITECTURE.md` | `ARCHITECTURE.md`, `docs/architecture.md`, `docs/design.md` |
| `docs/ENV_MATRIX.md` | `docs/ENVIRONMENTS.md`, `docs/environments.md`, `docs/env.md` |
| `docs/MIGRATION_RUNBOOK.md` | `docs/MIGRATIONS.md`, `docs/migrations.md`, `docs/RUNBOOK.md` |
| `STATE.md` | `docs/STATE.md`, `PROGRESS.md`, `docs/STATUS.md` |
| `AGENTS.md` | `CLAUDE.md` |
| `.env.example` | `.env.sample`, `.env.template`, `.env.dist` |
| `.github/workflows/gates.yml` | the first existing workflow file |

Two candidates for one deliverable: it picks the first and reports a medium `conflict` gap.
Rows that only apply to Supabase are dropped when Supabase is not detected.

## Gaps by risk

| Risk | Gap | What it means | Fix |
|---|---|---|---|
| high | a real `.env` committed to git | secrets are in history | owner action: rotate the secrets, remove the file from git, add it to `.gitignore` |
| high | no gate commands found | nothing says what "green" is | state the gate commands in `AGENTS.md` (stage 5) |
| high | no CI workflow | nothing runs the gates on a clean clone | render the CI workflow (stage 5) |
| high | a `*.sh` with CRLF line endings | the script fails on Linux and in CI | convert to LF; add `.gitattributes` |
| medium | rules only in `CLAUDE.md` | other agent tools do not read them (L100) | make `AGENTS.md` the source; keep `CLAUDE.md` as a pointer |
| medium | no rules file | agents have no repo rules | render `AGENTS.md` (stage 5) |
| medium | no state file | the next session cannot see where the work stands | render `STATE.md` (stage 0) |
| medium | `conflict`: two files for one deliverable | it is unclear which one is true | the owner picks one and removes or merges the other |
| low | a deliverable is still missing | no doc for that stage | the matching stage renders it |

Present the report high-risk first. Where the owner must act (rotate secrets, merge two documents),
list it under "Owner actions" and log it with `log.mjs`.

## How render and preflight use it

- `render.mjs` reads `.kickoff/adopt.json` and never writes a deliverable listed in `mapped`, even with
  `--force`. It prints `skip <path> (mapped to <existing>)`.
- `preflight.mjs` treats a mapped deliverable as present.
