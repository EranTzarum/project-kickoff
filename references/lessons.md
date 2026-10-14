# Lessons from a three-month multi-tenant CRM build

Sources: git history (365 commits, 63 migrations), repo docs, the owner's notes, and the owner's chat
history across Claude Code, Codex and Cursor (history.jsonl, claude-mem summaries and observations,
Codex thread index, Cursor prompts). Each row: what happened, the evidence, the rule it produced, and
the kickoff stage that now owns the rule. `stages.md` cites these ids; quote the row when the user asks "why".

Format: `| id | date | category | what happened | evidence | rule | stage |`

## Intake (stage 0)

| id | date | category | what happened | evidence | rule | stage |
|---|---|---|---|---|---|---|
| L1 | 2026-07-19 | env | Stripe could not onboard a business in its country; billing was coded anyway and still returns 503 months later | STATE.md:134, REGISTER.md:73 | Confirm the payment provider supports the business's country before any billing code exists | intake |
| L2 | 2026-07-08 | ui | Only a mobile phone is the field user's device; layouts broke on mobile across three fix rounds | Cursor 2026-08-09 screenshots | Name the primary device at intake; every layout change is done when a mobile screenshot is checked | intake |
| L3 | 2026-07-08 | extension | DOM selectors matched only English labels and failed once the live site was in a right-to-left language | fb extension fix | Name every UI language at intake; selectors, i18n and RTL rules follow from that answer | intake |
| L4 | 2026-07-12 | env | The first three sessions were pure tooling bring-up (/login, /model, GitHub auth in a non-English locale) before any feature | Codex threads 07-12 | Tooling/auth/CLI bring-up is its own tracked pre-flight checklist, separate from the first feature | intake |
| L5 | 2026-07-30 | env | jq and ripgrep were missing on Windows and rediscovered missing in several sessions | claude-mem obs 07-30 | Audit and install the CLI toolchain once at setup; write the shell (PowerShell/Git Bash/WSL) into docs | intake |
| L6 | 2026-07-19 | orchestration | "Do not write the code yourself" was enforced mid-project after friction; dispatch failures then cost more than direct fixes | history 07-19, claude-mem 08-01 | Decide the division of labor (who plans, who codes, which sandbox can run gates) at intake and record it | intake |
| L7 | 2026-08-12 | process | A full session went to decoding Cursor's bucket-vs-wallet billing that was never verified before adoption | Cursor prompts 08-12 | Research a new paid tool's quota/billing model once, up front, and record it in the vault | intake |
| L8 | 2026-07-19 | process | A worker stalled asking permission to touch a shared dialog component and needed a second "AUTHORIZED" ticket | Codex R6 | Pre-authorize backward-compatible edits to shared components in the ticket's scope | intake |
| L9 | 2026-08-06 | process | A plan was approved, then the owner had to add an archive-visibility rule before generation | Cursor prompts 08-06 | A plan is approvable only with full acceptance criteria including edge-case visibility rules | intake |

## Domain and data model (stage 1)

| id | date | category | what happened | evidence | rule | stage |
|---|---|---|---|---|---|---|
| L10 | 2026-08-02 | domain | Property type was dismissed as "data-entry noise" and left out of the dedup key; 7 real properties (house/plot/subdivision at one address) were hidden until the owner reviewed live data | STATE.md:516, claude-mem 08-02 | Enumerate every attribute that makes two real-world records different WITH the owner, against real examples, before writing a dedup key | domain |
| L11 | 2026-07-31 | db | The grouping key omitted transaction type, merging a sale and a rental at one address and writing rent into the sale's price history | 5653259, Codex 07-31 | A dedup key over money data includes every business-meaningful discriminator; verify on production-shaped data | domain |
| L12 | 2026-08-01 | db | Budget scoring silently zeroed any one-sided budget ("up to X"); the budget rule was redone in 0017, 0020, 0050 | 0017, 33a25ef, 0050 | Domain rules (bands, thresholds, asymmetries) are agreed with the owner and written down before any SQL; every null combination is enumerated | domain |
| L13 | 2026-08-06 | db | The budget parser read "3.5" as 4,390,000+ instead of 3,500,000 because the agency's decimal-million shorthand was never written down | Cursor prompts 08-06 | Capture data conventions (units, shorthand, locale formats) in the glossary before any parser exists | domain |
| L14 | 2026-08-09 | domain | "Unpublished" was mapped into Archive, conflating publish state with lifecycle state — "a severe business logic error" | Cursor prompts 08-09, vault 2026-08-09 | Write each status/flag's distinct meaning (lifecycle vs publish vs archive) before any filter touches two of them | domain |
| L15 | 2026-08-02 | domain | Enums, ownership, sharing levels and sellers arrived through dozens of later migrations; the extension froze the enum vocabulary as a contract | vault "Extension contract is frozen" | Freeze lifecycle enums and the role vocabulary at stage 1; treat later changes as contract changes needing owner approval | domain |
| L16 | 2026-08-02 | db | All 377 imported clients got `created_at` = import date, corrupting recency for weeks | claude-mem 08-02 | Every imported entity maps a real source timestamp to `created_at`; spot-check for suspicious uniformity | domain |
| L17 | 2026-07-31 | db | Source fields that looked meaningful by name (`dealType`, `Price`) were empty or contradictory on inspection | claude-mem 07-31 | Validate every source field's real value distribution before mapping it; never trust a name or a spec | domain |
| L18 | 2026-08-01 | domain | Naive address matching found 4.9 % overlap; local-language spelling normalisation raised it to 92 % | claude-mem 08-01 | Before declaring a data link infeasible, rule out normalisation as the blocker | domain |
| L19 | 2026-08-02 | process | UI-polish tickets only became useful after 215 real properties and 377 real clients were loaded | Codex 08-02 | Seed a realistic data sample before UI-polish work so feedback comes from real density | domain |
| L20 | 2026-07-19 | ui | Every invite failure was mapped to the rate-limit toast, hiding the real cause; a follow-up ticket keyed it on the status code | Codex R18/R18b | Map upstream errors to user messages by specific code from the first pass, never a catch-all bucket | domain |

## Architecture and security (stage 2)

| id | date | category | what happened | evidence | rule | stage |
|---|---|---|---|---|---|---|
| L21 | 2026-07-13 | rls | The first multi-agent identity migration let an agent forge a colleague's licence; hardened in the next migration | 0007 → 0008 | Threat-model every client-writable identity field; stamp identity server-side from day one | architecture |
| L22 | 2026-09-23 | rls | Postgres default EXECUTE grants made a board RPC anon-callable after re-creation, and a refresh-token RPC browser-reachable for ten migrations | 0043, 0046, d8bb1bf | Every new or re-created function gets `revoke execute … from anon, public` in the same migration; an anon-surface test exists from day one | architecture |
| L23 | 2026-07-31 | rls | A table had a correct RLS policy but anon still held raw table grants | 0013, claude-mem 07-31 | Pair RLS with explicit `revoke all … from anon` on every sensitive table; grants and RLS are independent layers | architecture |
| L24 | 2026-08-06 | perf | The Team tab took 6–7 s (N× user lookups behind an own-row policy); fixed by denormalising | f2ad2a4 | Design peer-data read paths (peer SELECT policy or DEFINER RPC) at schema time | architecture |
| L25 | 2026-09-03 | deploy | A `*/15` cron failed silently for three weeks: the Hobby plan allows one cron run per day | c12e1d5, vault 2026-09-03 | Write the platform limits (crons, function duration, body size, plan tier) into ARCHITECTURE before designing background jobs | architecture |
| L26 | 2026-09-24 | ui | Mobile signing failed on the server's 100 kB JSON limit (phone signature PNGs) | a265be7 | Set request/upload/canvas size budgets in ARCHITECTURE §7 | architecture |
| L27 | 2026-09-23 | extension | The extension trusted only the old hosting origin and stopped working silently after the domain move | cc64794 | Decide the canonical domain before launch; every origin allowlist reads it from config | architecture |
| L28 | 2026-07-19 | deploy | A CSP ticket worked only because it enumerated the literal origins the app calls | Codex R7 | Security headers and CORS are written against the verified origin list, never a generic template | architecture |
| L29 | 2026-07-13 | rls | Owner-only endpoints had to filter by both the target id and the caller-derived tenant id | Codex R3 | Owner-only mutations re-derive the tenant id server-side and check it with the target id | architecture |
| L30 | 2026-07-19 | process | Money-path signature verification was pinned to the provider's official SDK by name | Codex R14a | Name the vetted library for every money/auth-signature path; never leave crypto to agent discretion | architecture |
| L31 | 2026-07-31 | env | The spreadsheet parser for untrusted uploads had unpatched CVEs; the vendor had stopped publishing to npm | claude-mem 07-31 | Audit a library's CVE history and real patch channel before adopting it for untrusted input | architecture |
| L32 | 2026-07-08 | deploy | The monorepo hosting config did not route the API until a later patch | Cursor prompts 07-08 | Define full multi-app routing in the initial hosting config | architecture |
| L33 | 2026-07-31 | auth | An external API split auth across two hosts (bearer vs cookie+header); the wrong scheme silently 401'd for an hour | claude-mem 07-31 | Map every external API's auth scheme per host before integration code | architecture |
| L34 | 2026-07-31 | process | 589 browser-driven downloads took 45 min; a server-side parallel fetch took 2 min | claude-mem 07-31 | Bulk data pulls run server-side by script, not through the browser's download UI | architecture |
| L35 | 2026-08-09 | ui | Virtual-list scroll restore took three iterations (pixel offset drifted) before an index-based fix | 85ff3b2…134adcf | Spike risky UI mechanics (virtualisation, scroll memory) before building on them; save row index, not pixels | architecture |
| L36 | 2026-09-03 | db | A full-history sync-token design was replaced by a ±14-day window after merge | 7c495a7 | Validate a sync design against real data volume before building it | architecture |

## Database setup (stage 3)

| id | date | category | what happened | evidence | rule | stage |
|---|---|---|---|---|---|---|
| L37 | 2026-07-07 | auth | The access-token hook "succeeded" but never saw a membership: the hook role had no read policy on the membership table | b0724cf, 0002 | The auth-hook recipe ships WITH the hook role's own RLS policy; it is applied and tested before the first sign-in | db |
| L38 | 2026-09-24 | db | Migration prefixes collided three times across branches (0035 ×3, 0045 ×2); live names now differ from repo files | 215a03b, 3e285b5, TAKEOVER.md:72 | Timestamped migration names plus a hook that refuses a prefix already on origin/main | db |
| L39 | 2026-08-18 | db | Types were regenerated reactively at least seven times; one stale-type cast left a button hanging forever | 2a51f26…eb6666e, 6861e35 | Type regeneration is part of "migration applied" (script + runbook); CI fails on drift | db |
| L40 | 2026-08-02 | db | Code referenced a column that does not exist — twice, on different days, by different agents | bebf763, ca27ca2 | Generated types are the only schema source; a dependent UI ticket is dispatched only after types are regenerated | db |
| L41 | 2026-07-31 | db | A partial unique index broke the upsert (`42P10`); two follow-up migrations | 5653259, 7726741 | No partial unique index behind an upsert; write and test the exact upsert statement in the same change as the index | db |
| L42 | 2026-07-31 | db | Price-history rows duplicated on every re-import; no uniqueness guard on the child table | 0015 | Idempotent imports need a unique constraint on every child table's natural key, not just the parent | db |
| L43 | 2026-09-23 | db | A CHECK passed on NULL, letting an empty trial code through; fixed a migration later | 0040 → 0041 | CHECKs spell out `x is not null and …` | db |
| L44 | 2026-08-02 | db | A trigger-assigned NOT NULL column made the generated Insert type demand a field the app never supplies | claude-mem 08-02 | Trigger-assigned NOT NULL columns carry a DEFAULT sentinel | db |
| L45 | 2026-08-13 | db | A new FK returned PGRST200 in relation-embed queries until the API schema cache caught up | claude-mem 08-13 | After adding an FK, confirm the schema cache before relation-embed queries | db |
| L46 | 2026-09-27 | testing | Live suites leaked 9 synthetic tenants, 117 orphan PDFs, 31 half-seeded tenants; the password policy broke random test passwords | cb1c80d, 5b20f6f, f517c16 | Separate test database project; teardown registers ids as they are created; one test-credential helper | db |
| L47 | 2026-09-27 | env | The Free plan meant no backups and no leaked-password check while real data had lived there for two months | REGISTER.md:101 | Decide plan tier and backup policy before real data arrives | db |
| L48 | 2026-07-28 | env | The keepalive cron `*/2` in day-of-month ran on odd days only; one failed run then let the free-tier DB pause | claude-mem 07-28 | Daily keepalive; verify cron semantics; fail fast on an empty secret | db |
| L49 | 2026-07-07 | rls | An explicit revoke was needed on a trigger function after an advisor note | 21f5504 | The migration template includes revokes by default | db |

## Auth and environments (stage 4)

| id | date | category | what happened | evidence | rule | stage |
|---|---|---|---|---|---|---|
| L50 | 2026-07-07 | auth | Magic links failed with `otp_expired`, "signed in but no membership", and a set-password loop — all found by a non-technical user on day one | history 07-07, vault timeline | Redirect URLs per environment are registered before the first invite; the invite→set-password→sign-in flow is walked by a non-technical tester in Preview | auth-env |
| L51 | 2026-07-07 | deploy | The dev port had to be pinned because the auth redirect must match exactly | 5f0d88e | Pin the dev port in config and list it in ENV_MATRIX | auth-env |
| L52 | 2026-07-13 | env | The built-in auth mailer rate-limited (429) re-invites; custom SMTP stayed open for months | d1bb159, STATE.md:93 | Custom SMTP is configured before any auth email flow | auth-env |
| L53 | 2026-07-13 | auth | The first invited agent onboarded before the password gate was live and got locked out | STATE.md:38 | Finish the invite/password flow (feature flag or staging) before sending real invites | auth-env |
| L54 | 2026-09-22 | auth | Google's testing status expired refresh tokens after ~7 days; the feature had to be gated and verification was still unsubmitted months later | 82338c7, features.ts | Start OAuth verification (domain, privacy policy, consent screen) when the feature is first scoped | auth-env |
| L55 | 2026-09-03 | auth | An OAuth connect flow could never work in any browser (client checked a status that is always 0 after a redirect) | a2adc09 | One end-to-end browser smoke test per OAuth flow before merge | auth-env |
| L56 | 2026-09-27 | env | Vercel Preview held production secrets while sharing the production DB | REGISTER.md:110 | Env matrix per scope before the first deploy; Preview never receives prod secrets when it shares prod's DB | auth-env |
| L57 | 2026-09-15 | deploy | Six empty redeploy commits for Preview env changes, plus one because the platform rejects a bot git author | c10ec75…6e0a4b6, 7b96e40 | Set the env matrix and a valid bot git author before the first deploy | auth-env |
| L58 | 2026-07-30 | env | A local settings file granting elevated MCP permissions was not gitignored | claude-mem 07-30 | Gitignore local permission/settings files before granting anything through them | auth-env |
| L59 | 2026-07-13 | deploy | Local TypeScript target was above the hosting runtime's; three narrowing fixes after deploy | 2295c71, dba2914, 05f8a7a | Match tsconfig target to the hosting runtime and build in CI before the first deploy | auth-env |

## Workspace and harness (stage 5)

| id | date | category | what happened | evidence | rule | stage |
|---|---|---|---|---|---|---|
| L60 | 2026-08-10 | testing | The first unattended crew run failed every ticket: `--env-file` hard-fails on a missing `.env`, which exists only in the main checkout | 83f13ab, vault 2026-08-10 | A gate is only real if it passes in a clean worktree with no `.env`; live suites skip, never fail | workspace |
| L61 | 2026-09-22 | testing | The client module threw at import, so every `skip:` guard was dead and the crew gate broke | 8f285e1, REGISTER.md:147 | Validate config lazily; prove every gate in a worktree with no credentials | workspace |
| L62 | 2026-09-24 | process | A `node_modules` junction in a worktree led `git worktree remove` to delete the real `apps/` and `.env`; local main was also stale versus production | TAKEOVER_SELLERS_AND_CALENDAR.md:66 | A worktree setup script: fetch first, `npm ci` inside, never junction | workspace |
| L63 | 2026-08-02 | process | `git add -A` swept a worker's half-written files into a commit and broke main; never became a hook | bebf763 | Never stage broadly while any worker is mid-edit; stage only files you own; run gates before pushing | workspace |
| L64 | 2026-07-13 | deploy | A file left out of a commit was hidden by CLI working-tree deploys while CI went red | e68862a, 6160832 | Deploy only from git (CI build of a clean clone) | workspace |
| L65 | 2026-08-12 | deploy | Vercel's production source pointed at a feature branch | history 08-12, vault memory | Production deploys from `main` only; rule written into CLAUDE.md and the hosting project | workspace |
| L66 | 2026-09-15 | deploy | Migration 0033 was never applied; write-back failed silently in production for weeks because every catch swallowed its error | 5e5ff7d, ab2d738 | No swallowed errors rule + "migration applied" as a deploy checklist step | workspace |
| L67 | 2026-09-23 | deploy | Three times a migration did not ship with the deploy that needed it (signing broke twice) | REGISTER.md:60, runbook | Migration runbook: additive → deploy → revoke; applied names recorded in STATE.md | workspace |
| L68 | 2026-09-22 | docs | Six doc claims contradicted shipped code; HANDOFF.md claimed to be the source of truth while stale; CLAUDE.md said "future-only" for a feature its own exception already permitted | 4f93fe9, REGISTER.md:161 | One living STATE.md; other status docs marked superseded; rule docs updated in the commit that ships the feature | workspace |
| L69 | 2026-08-02 | memory | Sessions died at quota with state only in the conversation; "refresh my memory where we stopped" asked repeatedly | history 07-28, vault Quota economics | STATE.md from day one; checkpoint at ~70 % quota, not 95 %; decisions to the vault | workspace |
| L70 | 2026-09-07 | docs | A takeover ticket had to mandate reading a "mistakes already made" file | Codex 09-07 | STATE.md carries a "mistakes already made" section per feature track; independently re-verify repo state with git before a takeover | workspace |
| L71 | 2026-07-19 | orchestration | Worker dispatches hung on stdin that never closed; ticket text passed through shell quoting failed silently across attempts | STATE.md:119, claude-mem 08-02 | Workers read tickets from a file path; dispatch redirects stdin; absolute cwd in every dispatch | workspace |
| L72 | 2026-08-02 | testing | A Cursor worker's sandbox cannot run npm; it honestly reported DONE_WITH_CONCERNS, and the orchestrator that trusted it shipped a broken build | claude-mem 08-02 | Know each worker's sandbox limits; re-run gates yourself on every hand-off | workspace |
| L73 | 2026-08-01 | orchestration | The Windows Codex sandbox crashed repeatedly (DLL init, desktop heap) | claude-mem 08-01 | Keep a pre-agreed fallback executor; kill stale subprocesses between waves | workspace |
| L74 | 2026-07-08 | process | Agent model settings churned three times in two days | 7734dad, 47f5ba3, 92aa1cf | Model-per-role policy fixed before agents are created; only current models allowed | workspace |
| L75 | 2026-08-02 | workspace | A plugin cost ~13 k tokens per session while none of its 397 skills was ever invoked | claude-mem 08-02 | Audit installed plugins for use vs cost; disable pure overhead | workspace |
| L76 | 2026-08-06 | orchestration | "Query the code graph before reading files" had to be retyped into nearly every research prompt | Cursor prompts 08-06 | Bake standing research rules into CLAUDE.md once | workspace |
| L77 | 2026-07-28 | docs | A dead stub branch 35 commits behind main confused project state | claude-mem 07-28 | Delete or tag a branch once its work landed elsewhere | workspace |
| L78 | 2026-07-31 | testing | The extension tests passed with an explicit glob and failed opaquely with directory discovery | claude-mem 07-31 | Pin exact test invocations (explicit globs) in docs and CI | workspace |
| L79 | 2026-08-05 | i18n | RTL/bidi fixes recurred all project long despite a day-one "logical utilities" rule | 7223b19…a88f13a | Shared RTL primitives plus a lint rule banning `ml-`/`mr-`/`text-left` | workspace |
| L80 | 2026-08-04 | ui | The design-token system was committed and reverted the same day; three redesign mockups all rejected | 6687f26 → 1d6e2b4, vault 2026-08-04 | Approve design tokens/primitives with the owner before UI waves; do not run design passes unattended | workspace |
| L81 | 2026-08-10 | orchestration | Four parallel tickets each re-pasted the full plan; two seats were dispatched twice | Codex 08-10 | Tickets reference one shared context file; per-seat completion is tracked before redispatch | workspace |
| L100 | 2026-10-11 | docs | The skill rendered CLAUDE.md plus an identical AGENTS.md copy into every project: two files to keep in step, and the copy is what Codex and Cursor actually read | issue #3, owner decision 2026-10-11 | One instruction file, AGENTS.md (Claude Code reads it natively when no CLAUDE.md exists); Claude-only rules go in a section inside it; graphify and the tool checks belong to `/ready`, not to stage 5 | workspace |

## Build loop (stage 6, per feature)

| id | date | category | what happened | evidence | rule | stage |
|---|---|---|---|---|---|---|
| L82 | 2026-07-31 | testing | The acceptance count (214 groups) came from the very key under test, so the test confirmed the bug | STATE.md:467 | Acceptance criteria are invariants derived independently of the code (inputs = outputs + rejected), never a count the code produced | build-loop |
| L83 | 2026-08-01 | testing | Hand-computed expected counts were wrong three times in a row and blocked a correct migration script each time | claude-mem 08-01 | Data migrations assert self-consistent invariants and merely report raw counts | build-loop |
| L84 | 2026-09-24 | testing | Mocked RPC unit tests hid three real bugs (wrong signature, detached call, page cap) | 55e7c99, 6861e35, 0c11956 | Contract tests pin RPC argument names to the migrations; every new RPC is added | build-loop |
| L85 | 2026-09-15 | testing | A test leaked env state via `??=` and was fixed twice | ab2d738, d3817eb | Hermetic tests: each test owns the env it asserts on | build-loop |
| L86 | 2026-08-13 | db | A client-side `.in()` with an empty/null array produced malformed queries: the root cause of a 400 bug found weeks later | claude-mem 08-13 | Guard every list filter against an empty array before sending | build-loop |
| L87 | 2026-08-09 | process | An unattended performance loop shipped straight to production and broke images and archive filtering; recovery was a hard revert | Cursor prompts 08-09 | Tag a known-good commit before any risky phase; a smoke-test checkpoint before an autonomous loop passes a query-shape change | build-loop |
| L88 | 2026-08-09 | testing | Typecheck failed repeatedly across successive edits in one autonomous loop | Cursor prompts 08-09 | Run typecheck after each meaningful edit inside a loop, not once at the end | build-loop |
| L89 | 2026-07-13 | process | Identical tickets were redispatched three or four times blind (up to 3.9 M tokens per run) | Codex R1, R14a | Cap identical-ticket retries at two; the next attempt diagnoses or splits | build-loop |
| L90 | 2026-08-03 | orchestration | One unattended "full UI/UX pass" burned ~180 M tokens; another feature track hit 90 M with several zero-token crashes | Codex 08-03, 09-07 | Hard token/turn budgets and checkpoint cadence on every open-ended mandate; triage a zero-token run before redispatch | build-loop |
| L91 | 2026-08-01 | process | The orchestrator implemented and tested itself instead of routing, burning frontier context | claude-mem 08-02, vault Orchestration playbook | The orchestrator plans and routes; workers implement; a different model family verifies | build-loop |
| L92 | 2026-07-13 | testing | A live rollback test required real invite emails and always hit the provider's rate limit | Codex 07-13 | Never gate a test on a rate-limited external provider; stub it and assert the compensation | build-loop |
| L93 | 2026-08-06 | testing | A stage claimed full text was saved, but real client cards showed truncated notes | Cursor prompts 08-06 | Spot-check N real records end-to-end before marking a data stage done | build-loop |
| L94 | 2026-08-09 | testing | A chunked-fetch rewrite caused a 17 s / 60-request waterfall and corrupted an aggregate | Cursor prompts 08-09 | Load-test incremental fetch changes against the full dataset before "done" | build-loop |
| L95 | 2026-08-01 | db | A ticket's own spec conflicted with a passing regression test; the test was right | Codex 08-01 | When new behaviour conflicts with a passing test, the test is the spec until the owner says otherwise | build-loop |
| L96 | 2026-08-02 | ui | A shipped feature looked missing because of browser cache | claude-mem 08-02 | Check hard refresh / cache before treating a "missing" deployed feature as a defect | build-loop |
| L97 | 2026-08-09 | process | The owner repeatedly had to ask "commit and push so I can review" | Cursor prompts 08-09 | Push a review checkpoint at the end of every implemented phase; never merge to main without instruction | build-loop |
| L98 | 2026-08-02 | testing | Verifiers reported files deleted that lived in a gitignored dir, and a git repo that was an empty shell | vault Cross-model verification | Trust the filesystem over any report, including a verifier's; run the one command yourself | build-loop |
| L99 | 2026-07-31 | orchestration | Two waves both needed the shared i18n dictionary and had to be serialised | claude-mem 07-31 | Identify shared-file touchpoints (i18n, generated types, config, lockfiles) before parallelising | build-loop |

## Ticket-brief anatomy (from the tickets that worked)

Every dispatch ticket carries: id + one-line title; READ FIRST file list; explicit write scope; explicit
off-limits; the contract when work is split (request/response shapes, enum values); a checkable acceptance
outcome (a command that exits zero, or an invariant); a pointer to CLAUDE.md; for migrations, "author only,
the orchestrator applies"; a severity flag on auth/money/legal text. Workers never spawn workers.

## Guardrail timeline (why stage 5 exists)

Hooks, agents, CLAUDE.md, isolation tests and keepalive all landed on 2026-07-07/08. The last hook change
was 2026-07-12. Nothing new until 2026-09-22 (week 11): i18n parity as a compile error, anon-surface and
full-isolation tests, lazy config, feature gate; 09-23 web tests in the gates; 09-24 RPC contract tests;
09-27 test cleanup helpers. Gaps that never became a hook or CI check on the CRM: migration collisions,
type regeneration, `git add -A` while a worker runs, migration-applied-before-deploy, Preview isolation.
The kickoff templates close the first four; the fifth is an ENV_MATRIX rule.
