# Placeholders used by the templates

Replace every one of these when rendering. The checker flags any `{{...}}` left in a deliverable.

| Placeholder | Meaning | Example (CRM) |
|---|---|---|
| `{{PROJECT_NAME}}` | human name | Example CRM |
| `{{PROJECT_SLUG}}` | kebab/lowercase id, also the vault `project:` slug | example-crm |
| `{{ONE_LINER}}` | what it is, one sentence | multi-tenant CRM + public listings for brokers |
| `{{PRIMARY_USER}}` | who uses it most, on what device | an agent in the field on a phone |
| `{{LANGS}}` | UI languages, default first | he, en (RTL default) |
| `{{COUNTRY}}` | where the business operates | Spain |
| `{{STACK_PROFILE}}` | file name under references/stack-profiles | supabase-react-vercel |
| `{{TENANT_TABLE}}` | the tenant root table | agencies |
| `{{TENANT_KEY}}` | tenant FK column on every tenant table | agency_id |
| `{{JWT_CLAIM}}` | claim carrying the tenant id | agency_id |
| `{{ROLES}}` | role vocabulary | owner, member |
| `{{GLOSSARY}}` | owner's terms and data conventions | "3.5" means 3,500,000 |
| `{{ENTITIES}}` | entity list with one-line meaning | properties, clients, interactions |
| `{{ENUMS}}` | frozen lifecycle enums | properties.status: draft/active/sold |
| `{{DOMAIN_RULES}}` | rules agreed with the owner before SQL | budget band -12.5 % / +7.5 % |
| `{{IDEMPOTENCY}}` | natural keys + unique indexes for import/sync paths | (agency_id, external_ref) |
| `{{OUT_OF_SCOPE}}` | explicit non-goals for v1 | billing, native app |
| `{{PEER_READ_PATHS}}` | how colleagues' rows are read (policy or RPC) | team list via peer SELECT policy |
| `{{SERVICE_ROLE_DIRS}}` | dirs allowed to hold the service-role key | apps/api/src/admin/ |
| `{{ANON_SURFACE}}` | views/RPCs anon may read or call | public_listings, leads insert |
| `{{IDENTITY_FIELDS}}` | client-writable identity fields stamped server-side | display_name, license_number |
| `{{INTEGRATIONS}}` | external contracts to freeze | Chrome extension payload |
| `{{PLATFORM_LIMITS}}` | rows copied from the profile's limits sheet | Vercel Hobby: 1 cron/day |
| `{{SIZE_BUDGETS}}` | body/upload/timeout budgets | JSON body 1 MB |
| `{{SUPABASE_PROJECT_ID}}` | prod project ref | abcdefghijklmnopqrst |
| `{{TEST_PROJECT_ID}}` | separate test/staging project ref | (new) |
| `{{BACKUP_PLAN}}` | who backs up prod and how often | Pro plan daily / weekly encrypted export |
| `{{PROD_URL}}` | canonical production origin | https://crm.example.com |
| `{{PREVIEW_URL_PATTERN}}` | preview origin pattern | https://*-team.vercel.app |
| `{{DEV_URL}}` | local origin, port pinned | http://localhost:5173 |
| `{{DEV_PORT}}` | the pinned dev port | 5173 |
| `{{SMTP_PROVIDER}}` | custom auth mailer | Resend |
| `{{OAUTH_PROVIDERS}}` | providers needing verification | Google Calendar |
| `{{ENV_ROWS}}` | env matrix rows, one column per tier (`env[].tiers[name]`, else legacy `dev`/`preview`/`prod`, else yes) | see template |
| `{{ENV_HEADER}}` | env matrix header + separator naming the tiers | \| KEY \| Purpose \| Local \| Prod \| Secret? \| |
| `{{ENV_TIERS}}` | one row per `environments[]` tier (derived Dev/Preview/Test/Prod from the legacy URL and project answers when absent) | \| Prod \| https://app.example.com \| main \| ... \| yes \| no \| |
| `{{LAUNCH_ITEMS}}` | owner-only blockers from `templates/launch/items.json`: `always` items, plus `email` (`smtpProvider` set, not none), `oauth` (`oauthProviders` other than none), `payments` (`payments: true`), `ai` (`aiProvider` set, not none), `vm` (`deployTarget: "vm"`); each a checkbox heading, what it unblocks and its owner steps | see `docs/LAUNCH.md` |
| `{{GATES}}` | gate commands, one per line | npm run typecheck |
| `{{DEPLOY_CMD}}` | how prod deploys (from git only) | push to main |
| `{{TYPES_TARGETS}}` | files that receive generated DB types | apps/web/src/lib/database.types.ts |
| `{{DATE}}` | today, ISO | 2026-09-28 |
| `{{VAULT_PATH}}` | notes-vault project folder or "none" | Projects/Example CRM |
