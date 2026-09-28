# Environment matrix — {{PROJECT_NAME}}

One row per variable. `.env.example` lists exactly these keys (no values). The checker cross-references them.
Scope columns say which deploy scopes receive the value. Preview never receives a production secret when it
shares the production database. Infra scripts fail fast on an empty required variable.

| KEY | Purpose | Dev | Preview | Prod | Secret? |
|---|---|---|---|---|---|
{{ENV_ROWS}}

## Origins and redirect URLs (auth)
| Env | Origin | Auth redirect URLs registered |
|---|---|---|
| Dev | {{DEV_URL}} | {{DEV_URL}}/** |
| Preview | {{PREVIEW_URL_PATTERN}} | {{PREVIEW_URL_PATTERN}}/** |
| Prod | {{PROD_URL}} | {{PROD_URL}}/** |

Dev port {{DEV_PORT}} is pinned in the dev server config because the redirect URL must match exactly.
Canonical production domain: {{PROD_URL}}. Every origin allowlist (CORS, CSP, extension, OAuth) reads it from config, never a hard-coded host.

## Auth mail
Custom SMTP: {{SMTP_PROVIDER}} — configured BEFORE the first real invite (the built-in mailer rate-limits at a handful of mails per hour).
Invite / set-password / sign-in flow is walked end-to-end in Preview by a non-technical tester before any real invite goes out.

## OAuth providers
{{OAUTH_PROVIDERS}} — verification submitted when the feature is first scoped; unverified/testing-mode refresh tokens expire in days. One browser smoke test per OAuth flow before merge.

## Databases
| Env | Project ref | Backups |
|---|---|---|
| Prod | {{SUPABASE_PROJECT_ID}} | {{BACKUP_PLAN}} |
| Test | {{TEST_PROJECT_ID}} | none needed; live suites run here and tear down what they create |

## Shell
Commands in docs and tickets state their shell (PowerShell vs Git Bash vs WSL). PowerShell 5.1 has no `&&`; use `npm.cmd` on Windows if the execution policy blocks `npm.ps1`.
