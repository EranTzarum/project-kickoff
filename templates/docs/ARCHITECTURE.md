# Architecture — {{PROJECT_NAME}}

Stack profile: `{{STACK_PROFILE}}`. Rules live in `AGENTS.md`; this file holds the model and the why.

## 1. Tenancy
- Tenant root table: `{{TENANT_TABLE}}`. Every tenant table carries `{{TENANT_KEY}}` and has RLS scoped to the `{{JWT_CLAIM}}` JWT claim.
- The claim is stamped by an auth hook; the hook's own role needs its own read policy on the membership table (it runs without a JWT, so `auth.uid()` is null there).
- Peer-data read paths (colleague rows, team lists) are designed here, not discovered as an N+1 later: {{PEER_READ_PATHS}}

## 2. Privileged access
- Service-role key allowed ONLY in: {{SERVICE_ROLE_DIRS}}. Everything else uses the request-scoped client so Postgres enforces isolation.
- Every new exception is named here with its single purpose, and the `service-role-guard.js` allowlist is updated in the same change.
- Owner-only mutations re-derive the tenant id server-side from the caller's membership and check it alongside the target id. Never trust an id from the request path alone.

## 3. Anonymous surface (whitelist)
Anon may read/call only: {{ANON_SURFACE}}. Views expose columns one by one; never owner contact data,
full addresses, notes, or evidence fields. Every new or re-created function gets `revoke execute ... from anon, public`
in the same migration (Postgres re-grants EXECUTE to public on create), and every new sensitive table gets
`revoke all ... from anon` even with RLS on — grants and RLS are independent layers.

## 4. Identity and trust boundaries
Client-writable identity fields: {{IDENTITY_FIELDS}} — stamped server-side, never trusted from the request body.
Threat model per field: who could forge it, what it would let them do.

## 5. Integration contracts (FROZEN)
{{INTEGRATIONS}}
Changing a column name, enum or payload shape here requires explicit owner approval and updating every
consumer in the same change. External APIs: auth scheme mapped per host before any integration code.

## 6. Platform limits that shape the design
Copied from the stack profile and checked against the plan actually purchased:
{{PLATFORM_LIMITS}}

## 7. Request/size budgets
JSON body limit, upload caps, canvas/signature payloads, function timeouts: {{SIZE_BUDGETS}}

## 8. Environments
Prod / Preview / Dev each have their own database or, if Preview shares prod's DB, Preview holds NO
production secrets. Details in `docs/ENV_MATRIX.md`.

## 9. Money and auth-signature paths
Named vetted libraries only (e.g. the provider's official SDK for webhook signature verification). Never hand-rolled.
Payment provider confirmed to support {{COUNTRY}} before any billing code exists.
