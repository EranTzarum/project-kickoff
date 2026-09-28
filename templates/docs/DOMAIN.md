# Domain — {{PROJECT_NAME}}

{{ONE_LINER}}
Primary user: {{PRIMARY_USER}}. Languages: {{LANGS}}. Country: {{COUNTRY}}.

## Glossary (owner's words)
Terms the owner uses, with the meaning agreed in the domain session. Data conventions belong here too:
units, shorthand (e.g. "3.5" = 3,500,000), date formats, phone normalisation, what "duplicate" means.

{{GLOSSARY}}

## Entities
One line each: what it is, who owns a row, which tenant column scopes it, which source timestamp becomes `created_at` on import.

{{ENTITIES}}

## Roles
{{ROLES}}

## Lifecycle enums (FROZEN — changing one is a contract change)
Every status/flag with its distinct meaning. Publish state, lifecycle state and archive state are
three different things; never derive one from another.

{{ENUMS}}

## Domain rules agreed with the owner (before any SQL)
Numbers, bands, thresholds, asymmetries. Each rule names who decided it and when.

{{DOMAIN_RULES}}

## Dedup / identity keys
For every import, sync or upsert path: the natural key (every attribute that makes two real-world records
different, checked against real examples with the owner) and the NON-partial unique index behind it,
on the parent AND every child table written.

{{IDEMPOTENCY}}

## Out of scope for v1
{{OUT_OF_SCOPE}}
