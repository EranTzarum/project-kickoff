# Owner steps

Why: in a field run the owner relayed messages between agents by copy-paste. Steps that said "see the previous
message", or had no exact place or no expected result, were lost or misapplied (L106). Owner actions use one
format and stand alone.

## Format

Under `## What you need to do` (Hebrew projects: `## מה אתה צריך לעשות`), numbered steps. This is exactly what
`scripts/owner-steps.mjs` prints for the JSON below (a test keeps the two in step):

````markdown
## What you need to do

1. **Where:** Hosting provider → Sign up
   **Do:** Create the account with the business email.
   ```
   ops (at) your-domain
   ```
   **You should see:** The dashboard opens with an empty project list.
2. **Where:** Domain registrar → Search domains
   **Do:** Buy the production domain.
   ```
   your-domain.com
   ```
   **You should see:** The domain is listed with an expiry date.
   **Can't be undone.**
````

## JSON schema

`node <skill>/scripts/owner-steps.mjs <steps.json>` renders a JSON array of steps (or `{ "steps": [...] }`):

```json
[
  { "place": "Hosting provider → Sign up", "action": "Create the account with the business email.",
    "value": "ops (at) your-domain", "expect": "The dashboard opens with an empty project list." },
  { "place": "Domain registrar → Search domains", "action": "Buy the production domain.",
    "value": "your-domain.com", "expect": "The domain is listed with an expiry date.", "irreversible": true }
]
```

`place`, `action` and `expect` are required. `value` (its own code block) and `irreversible` are optional.

`--lint` is strict: every numbered step needs a filled-in **Where:** and **Do:** and an expected result; a step
written as plain prose is rejected, because its place cannot be checked. Hebrew receipts may use **איפה:**,
**מה לעשות:** and **מה תראה:** instead.

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
