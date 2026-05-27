# `packages/db/seed`

Seed inputs for the database. `form-templates/` holds form-template seed JSON
(PT + EN labels, per-field `ai_extractable` flags) that maps to the
`form_templates` table — one file per `(key, version)` row.

Seed loader: **TODO**. Until then these files exist only as the source of
truth for the templates and will be wired in once the loader lands.
