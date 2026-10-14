# Owner steps

Why: in a field run the owner relayed messages between agents by copy-paste. Steps that said "see the previous
message", or had no exact place or no expected result, were lost or misapplied (L106). Owner actions use one
format and stand alone.

## Format

Under `## What you need to do` (Hebrew projects: `## מה אתה צריך לעשות`), numbered steps:

````markdown
## What you need to do

1. Create the business account.
   - **Where:** the hosting provider's sign-up page, "Create account".
   - **Do:** sign up with the business email and save the backup codes.
   - Value to type:
     ```
     billing@example.com
     ```
   - **You should see:** the dashboard with an empty project list.
   - **Can't be undone.** The account email cannot be changed later.
````

## JSON schema

`scripts/owner-steps.mjs` renders this from a JSON array:

```json
[{ "title": "Create the business account", "where": "…", "do": "…",
   "value": "optional text for its own code block", "see": "…", "irreversible": true }]
```

`where`, `do` and `see` are required. `value` and `irreversible` are optional.

## Rules

- One action per step.
- Exact place: which app or site, which menu, which button.
- The value to type or paste goes in its own code block.
- Say what the owner should see when it worked.
- Mark steps that cannot be undone with **Can't be undone.**
- Never refer to an earlier message ("as above", "see the previous message"). Repeat what is needed.
- Put everything in one message, at the end, under its own heading.

## Lint

```bash
node <skill>/scripts/owner-steps.mjs --lint <file.md>
```

It checks an existing section for the heading, the three required parts and references to earlier messages.

## Launch track

`docs/LAUNCH.md` items (owner-only blockers, started on day 1) use the same format, plus minutes and what each
item unblocks. Click paths there are marked not yet verified.
