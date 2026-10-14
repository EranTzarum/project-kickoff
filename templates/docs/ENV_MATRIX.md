# Environment matrix — {{PROJECT_NAME}}

One row per variable. `.env.example` lists exactly these keys (no values). The checker cross-references them.
Tier columns say which tiers receive the value. A tier never receives a production secret when it
shares the production database. Infra scripts fail fast on an empty required variable.

{{ENV_HEADER}}
{{ENV_ROWS}}

## Environment tiers
One row per tier. Whichever database holds real users is production-grade: no resets, backups on,
migrations only through docs/MIGRATION_RUNBOOK.md. A disposable tier never shares a database with it.

| Tier | Web host | Branch | Database | API origin | Auth redirects | Real users | Disposable |
|---|---|---|---|---|---|---|---|
{{ENV_TIERS}}

Backups for the real-user database: {{BACKUP_PLAN}}.

Dev port {{DEV_PORT}} is pinned in the dev server config because the redirect URL must match exactly.
Canonical production domain: {{PROD_URL}}. Every origin allowlist (CORS, CSP, extension, OAuth) reads it from config, never a hard-coded host.

## Auth mail
Custom SMTP: {{SMTP_PROVIDER}} — configured BEFORE the first real invite (the built-in mailer rate-limits at a handful of mails per hour).
Invite / set-password / sign-in flow is walked end-to-end in Preview by a non-technical tester before any real invite goes out.

## OAuth providers
{{OAUTH_PROVIDERS}} — verification submitted when the feature is first scoped; unverified/testing-mode refresh tokens expire in days. One browser smoke test per OAuth flow before merge.

## Shell
Commands in docs and tickets state their shell (PowerShell vs Git Bash vs WSL). PowerShell 5.1 has no `&&`; use `npm.cmd` on Windows if the execution policy blocks `npm.ps1`.
