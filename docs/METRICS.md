# Metrics

project-kickoff is one product in a product line. Like the other products, it claims nothing it has not
measured. Every project keeps its own ledger, and `measure.mjs` turns that ledger into numbers (lesson L101).

## The ledger

`<project>/.kickoff/HISTORY.jsonl` is append-only, holds one JSON object per line, and is committed with the
project. It never holds names, paths, URLs, prompts or secrets. `.kickoff/project.json` holds a random
`project_id`, so rows from different projects can be compared without identifying the project.
Nothing is written when the `CI` environment variable is set.

Every row has `v` (schema version, now `1`), `ts` (ISO time), `project_id` and `event`. The fields that
follow depend on the event:

| event | written by | extra fields |
|---|---|---|
| `stage_start` | the agent (`log.mjs`) when a stage's questionnaire begins | `stage` |
| `render` | `render.mjs`, once per stage that wrote files | `stage`, `files` |
| `regenerate` | `render.mjs --force` | `stage`, `files` |
| `stage_ready` | `preflight.mjs`, the first time a stage is READY | `stage` |
| `gate_run` | the project's `scripts/gates.mjs` | `passed`, `failed` |
| `owner_action_open` / `owner_action_done` | the agent | `id` (same id for both), optional `note` |
| `blocker` | the agent, when work stops on the owner | optional `id`, `note` |
| `pilot` | the agent, when the first real user signs in | — |

Log by hand: `node <skill>/scripts/log.mjs <project-root> <event> [--stage N] [--id X] [--note "..."]`.

## What `measure.mjs` reports

`node <skill>/scripts/measure.mjs <project-root> [--json]`. Missing data prints as `n/a` (`null` in JSON),
never as zero.

| metric | definition |
|---|---|
| idea to pilot | first ledger event to the first `pilot` event, in days |
| stage days | per stage 0–5: the first `stage_start` (else the first `render`) to the first `stage_ready` |
| owner actions | count, how many are still open, the age of the oldest open one, and open-to-done days per id |
| gate pass rate | the share of `gate_run` rows with `failed = 0` |
| regenerations | the count of `regenerate` events (rework on a deliverable) |
| blockers | the count of `blocker` events |

## Baseline

| project | idea to pilot | source |
|---|---|---|
| P1: multi-tenant CRM (the reference build) | about three months, from first commit to a working product; pilot date not recorded | git history, estimated |
| P2: SaaS with a VM-hosted API (field run) | n/a; reached private-beta readiness, start date not recorded | owner report |

"Idea to pilot in about two weeks" is a **HYPOTHESIS** until at least two projects have measured ledgers.
The README must not promise it before then.
