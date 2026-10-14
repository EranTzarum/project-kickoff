# Contributing

## Propose a lesson

A lesson is one row in `references/lessons.md`, in the 9-column format:

```
| id | date | category | what happened | evidence | rule | stage | source | class |
```

1. Take the next free lesson id.
2. Set `source` to the next free `C<n>` and declare it under `## Sources` with a one-line invented description, for example `C1` — a small booking site built by one person.
3. Set `class` to `CANDIDATE REUSABLE`.
4. Anonymize it: no names, paths, client or project names, prompts, logs or email addresses.
5. Run `node scripts/lessons.mjs --lint` and the full gate in `AGENTS.md`.

When a second project shows the same lesson, a PR adds that source to the row and moves it to `CONFIRMED REUSABLE`.

Your own lessons stay on your machine: `retro.mjs --save` writes them to `~/.project-kickoff/lessons.jsonl`. Sharing one is this PR.

## Code changes

Follow `AGENTS.md`: run the gate before you push. This repo is public, so keep personal paths, usernames, private project or client names, and real prompts or logs out of every file.
