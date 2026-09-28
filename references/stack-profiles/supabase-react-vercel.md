# Stack profile: supabase-react-vercel (the CRM stack, the default)

React 19 + Vite + Tailwind v4 + shadcn/ui (`apps/web`), optional Node + Express (`apps/api`, parked unless
server-only logic is needed), Supabase (Postgres + Auth + Storage), Vercel hosting with git integration,
Claude Code as primary harness with Codex / Cursor workers. Frontend talks to Supabase directly; RLS enforces isolation.

## Default answers

| Placeholder | Default |
|---|---|
| `{{TENANT_TABLE}}` / `{{TENANT_KEY}}` / `{{JWT_CLAIM}}` | `agencies` / `agency_id` / `agency_id` |
| `{{ROLES}}` | `owner`, `member` (several owners allowed) |
| `{{SERVICE_ROLE_DIRS}}` | `apps/api/src/admin/` |
| `{{ANON_SURFACE}}` | none until a public page is scoped; then `public_*` views + one `leads` insert policy |
| `{{TYPES_TARGETS}}` | `apps/web/src/lib/database.types.ts`, `apps/api/src/lib/database.types.ts` |
| `{{DEV_URL}}` / `{{DEV_PORT}}` | `http://localhost:5173` / `5173` (pin `server.port` + `strictPort` in `vite.config.ts`) |
| `{{PREVIEW_URL_PATTERN}}` | `https://*-<team>.vercel.app` |
| `{{SMTP_PROVIDER}}` | Resend |
| `{{DEPLOY_CMD}}` | push to `main` (Vercel git integration; Production source = `main` only) |
| `{{GATES}}` | see below |
| `{{LINE_ENDINGS}}` | CRLF (Windows checkout) |
| `{{ENV_KEYS}}` | see below |

Default gates (each passes in a clean worktree without `.env`):
```
npm run typecheck
npm test -w apps/web
npm test -w apps/api
npm run build -w apps/web
```
`apps/api` test script: `node --env-file-if-exists=.env --import tsx --test "src/**/*.test.ts"` — explicit glob, optional env file.
Live-DB suites `skip` when `SUPABASE_SERVICE_ROLE_KEY` is unset; the Supabase client module must not throw at import.

Default env keys (web / api):
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_PROJECT_ID
PORT
```

## Platform limits sheet (copy into ARCHITECTURE §6, verify against the purchased plan)

| Service / plan | Limit that bit the CRM | Consequence |
|---|---|---|
| Vercel Hobby | cron jobs run at most once per day; `*/15` silently fails | design background jobs for a daily cadence or buy Pro |
| Vercel Hobby | serverless function duration 10 s default | long PDF renders / syncs must be bounded |
| Vercel | Production source must be `main`; branch deploys can silently stop building | deploy from `main` only; check the dashboard source after any branch work |
| Vercel Preview | shares whatever DB URL you give it | Preview gets a test DB, or no prod secrets |
| Vercel build | lib target below es2022 | set `tsconfig` target/lib to match; `Object.hasOwn` needed a polyfill |
| Vercel | rejects git author `crew@local` | bots commit with a valid author |
| Express | JSON body 100 kB default | raise `express.json({ limit })` for signature PNGs / uploads |
| Supabase Free | project pauses after ~7 days idle; no backups; no leaked-password protection | daily keepalive workflow; decide Pro before real data |
| Supabase Auth built-in mailer | a few emails per hour, 429 after | custom SMTP before the first invite |
| Supabase Auth | Site URL + Redirect URLs must match exactly, including port | pin dev port; register per env |
| Supabase | `EXECUTE` granted to `public` on every created function; anon table grants independent of RLS | revoke in every migration |
| PostgREST | `ON CONFLICT` cannot use a partial unique index; empty `.in([])` malformed; new FK needs schema-cache refresh for embeds | non-partial indexes; guard empty arrays; check cache after FK |
| Google OAuth "Testing" status | refresh tokens expire after ~7 days | submit verification when the feature is scoped; gate the feature until verified |
| Chrome MV3 extension | no extensions on mobile Chrome; content scripts cannot complete some trusted UI actions | mobile path is assisted (copy/open), not automated |
| Node test runner | prints `ℹ pass N` / `ℹ fail N`, not `# pass` | grep the right summary line in gates |
| Windows PowerShell 5.1 | no `&&`; `npm.ps1` blocked by execution policy | `;` chaining or Git Bash; `npm.cmd` |

## Harness defaults

- Hooks: block-env-edit, block-destructive-sql, service-role-guard, migration-number-check (all in `templates/claude/hooks`).
- Agents: quality-gate (sonnet), rls-auditor (sonnet). Model-per-role: workers on the cheapest seat that passes gates; orchestrator on the frontier seat; verifier on a different family.
- Workers: Codex CLI (Windows sandbox can crash; WSL more stable), Cursor agent (sandbox cannot run npm → orchestrator re-runs gates).
- Memory: `STATE.md` in repo (what/where), Obsidian vault (why), Graphify for code structure. Never duplicate across them.
