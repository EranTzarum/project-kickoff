# Linking a browser extension to the site

Two patterns, both built and run in real projects. Stage 2 picks one when the project has an extension, and writes
the choice and its one-line reason into `docs/ARCHITECTURE.md`.

## A. The extension talks to the server

**How:** the extension holds its own sign-in (for example a Supabase session kept in `chrome.storage`). Every few
minutes it polls a job queue on the server API and reports results straight back.

**Gives:**
- Works with no site tab open.
- The user approves on the phone; the computer runs the job as soon as Chrome is open.
- Jobs wait in the queue while the computer is off.

**Costs:**
- Server-side auth for the extension, and a queue with a lease and idempotency (a job is claimed once, a retry never
  runs it twice).
- A host permission for the API in `manifest.json`.
- Tokens stored in the extension: keep them in `chrome.storage`, scope them, refresh them, never log them.

**Fits when:** an action is approved in one place and run on the computer, work runs in the background, or the user
wants control from the phone.

## B. The extension talks only to an open site tab

**How:** the extension sends a message to the site's tab (for example a `jobs-request` message every minute). The
tab, already signed in, fetches the jobs and returns the results.

**Gives:**
- Simple.
- No tokens in the extension and no host permission for the API.
- All permissions stay in the site.

**Costs:**
- With no tab open everything stops; the extension icon should show it (for example a `!` badge).
- A job created from the phone runs only once a tab is open on the computer.

**Fits when:** the user sits in the site while the work happens, actions are short and immediate, and a fast store
review matters.

## Which one

- Phone control or background work: **A**.
- Everything happens while the user is in the site: **B**.
- Starting with B and moving to A later is fine, but costs a new extension version and a store review. If the
  site-extension contract is frozen (L15), add the direct path next to the old one, never in its place.
