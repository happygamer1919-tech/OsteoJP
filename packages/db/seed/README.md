# `packages/db/seed`

Seed inputs and the loader script that consumes them. Seeds run with
service-role credentials (outside any request context), so they bypass RLS
and MUST set `tenant_id` explicitly on every row — never globally.

Currently scoped to `form_templates`. Additional seeders (services,
permission roles, …) will land alongside this one in the same shape.

## form-templates loader — contract

**This section is the contract.** Anything writing a seed JSON for
`form_templates` MUST match it; the loader does not migrate other shapes.

### File location

```
packages/db/seed/form-templates/<key>-v<version>.json
```

- One file per `(key, version)` row.
- Filename convention: `<key>-v<version>.json` (e.g. `osteopathy-v1.json`).
  The filename is informational only; the identity used for upsert lives
  inside the file (`key`, `version`).

### JSON shape

```jsonc
{
  "key": "osteopathy",                // text — form_templates.key
  "version": 1,                       // integer ≥ 1 — form_templates.version
  "title": {                          // jsonb — form_templates.title
    "pt": "Osteopatia — Avaliação de Episódio",
    "en": "Osteopathy — Episode Evaluation"
  },
  "schema": {                         // jsonb — form_templates.schema
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["episode_date", "consultation_reason"],
    "properties": { /* …field definitions… */ }
  }
}
```

Field rules:

| Field     | Type                        | Notes                                                       |
| --------- | --------------------------- | ----------------------------------------------------------- |
| `key`     | non-empty string            | Domain slug (`osteopathy`, `physiotherapy`, `rpg`, `nesa`). |
| `version` | positive integer            | Bump when the schema changes shape, not for label edits.    |
| `title`   | `{ pt: string, en: string }`| Bilingual UI label; PT is the source of truth.              |
| `schema`  | object                      | JSON-Schema body; stored verbatim in `form_templates.schema`. |

The drafts in `docs/draft-form-templates/` are pure JSON-Schema and need to
be wrapped into this shape on relocation. The existing `title` string and
the `x-meta` block in the draft do not map — author a proper bilingual
`title` and drop `x-meta` (or keep it inside `schema` if useful).

### Upsert identity

Loader upserts on `(tenant_id, key, version)` — matches the
`form_templates_tenant_key_version_uq` index in [`packages/db/src/schema.ts`](../src/schema.ts).

- Missing row → INSERT.
- Existing row, `title` + `schema` byte-identical → no-op (no
  `updated_at` bump).
- Existing row, content differs → UPDATE (`title`, `schema`).

Versioned bumps (`v1` → `v2`) are additive: ship a new file, the old row
stays in place. Form templates referenced by a `clinical_record` are
immutable per the architecture rules; bump `version` rather than
rewriting `v1`'s `schema`.

### Run command

```bash
# One tenant per invocation. Service-role connection string + tenant UUID.
SEED_TENANT_ID=<tenant-uuid> \
DATABASE_URL=<supabase-service-role-url> \
pnpm --filter @osteojp/db run seed:form-templates
```

Both env vars are required; the script exits non-zero if either is missing.
Idempotent — safe to re-run.

To install templates into a new tenant, run the same command again with
that tenant's UUID. The loader has no `--all-tenants` mode (yet) to keep
the blast radius explicit.

### Programmatic use

```ts
import { loadFormTemplates } from "@osteojp/db/seed/form-templates";

await loadFormTemplates(db, tenantId);            // default dir
await loadFormTemplates(db, tenantId, { dir });   // custom dir (tests)
```

`db` is any Drizzle pg client (postgres-js, node-pg, …). The seeder uses
only `select / insert / update` — no driver-specific features.

### Behaviour on empty directory

If `seed/form-templates/` is empty or absent, the loader logs and returns
`[]`. It does not throw. This lets the script land before Max's
relocation PR without crashing the seed pipeline.
