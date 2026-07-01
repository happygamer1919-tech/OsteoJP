# Migration Notes — Fisiozero → OsteoJP

**Maintained by:** Max — append-only for the batch log section. Never delete entries.
**Sources:** Fisiozero (primary), Stylus.pt (scheduling), manual clinic records
**Target:** OsteoJP platform (Supabase EU Frankfurt, tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`)
**Phase:** 5 — explicitly deprioritised. Pipeline foundation is on `main`; scraping and import have not run yet.

> This document covers (1) the pipeline architecture now on `main`, (2) known edge cases and how the code handles them, (3) the reconciliation report format, (4) the health dashboard queries, and (5) what Ivan still needs to build before Phase 5 can run. Verified against `packages/db/src/migration/` (PRs #273–275) and `packages/db/migrations/0014_migration_staging.sql`.

---

## Status

| Location | Patients | Appointments | Clinical records | Status |
|---|---|---|---|---|
| Linda-a-Velha | — | — | — | Not started |
| Castelo Branco | — | — | — | Not started |

---

## Pipeline overview — staging → validation → production

The pipeline has four named stages. All state lives in a single table, `migration_staging_rows`, whose `status` column is an enum state machine. The import job runs as an authenticated staff principal (owner or admin claims) so Postgres RLS enforces tenant isolation on every query.

```
┌──────────┐  stageRows()     ┌───────────────┐
│  source  │ ──────────────▶  │    pending     │
│ adapter  │   raw + record   └───────────────┘
└──────────┘                          │
   (not yet                           │  applyBatchValidation()
   implemented)               ┌───────┴──────┐
                               │              │
                         ┌─────▼─────┐  ┌────▼──────┐
                         │ validated │  │  failed   │◀── can be re-staged
                         └─────┬─────┘  └───────────┘    back to pending
                               │
                               │  importRecords()
                         ┌─────▼─────┐
                         │ imported  │  (terminal — ledger never forgets)
                         └───────────┘
```

### Stage 1 — Staging (`stageRows`)

`packages/db/src/migration/staging.ts → stageRows(tx, tenantId, batchId, rows)`

The adapter calls this once per batch with the raw source payload and the normalized intermediate record. Behavior on the unique key `(tenant_id, source_system, entity_type, source_id)`:

| Existing row status | Action |
|---|---|
| None | INSERT as `pending` |
| `pending` / `validated` / `failed` | UPDATE raw + batchId, reset to `pending`, clear `error_detail` |
| `imported` | UPDATE raw + batchId for audit; status and `imported_entity_id` **preserved** |

The `raw` column stores the untouched source payload (full CSV row or JSON object) for audit and replay. The normalized intermediate record is passed separately to the validator — the staging table never reads from `raw`.

Each batch gets a caller-supplied UUID (`batchId`). The same source row re-submitted in a later batch gets the newer `batchId`; re-staged `failed` rows are processed again.

### Stage 2 — Validation (`applyBatchValidation`)

`packages/db/src/migration/batch-validate.ts → applyBatchValidation(tx, tenantId, sourceSystem, records, stagedRows)`

Two-pass check: pure in-memory (`detectBatchIssues`) then one optional DB lookup to resolve cross-batch orphans.

**Pass 1 — `detectBatchIssues` (no DB, called first):**

Checks in order for every record in the batch:

1. **Duplicate `(sourceId, entityType)` within the batch** — the second occurrence is marked `failed`; the first proceeds to shape validation on its own merits.
2. **Per-record shape validation** (`validateMigrationRecord`) — see [Per-field validation rules](#per-field-validation-rules) below.
3. **In-batch orphan appointment check** — an appointment whose `patientSourceId` is absent from the current batch is flagged as `unresolved_reference`. This is a *candidate* orphan; Pass 2 clears false positives.

**Pass 2 — ledger lookup for candidate orphans:**

For every appointment flagged as an orphan in Pass 1, a single DB query checks `migration_staging_rows` for patient rows with `status = 'imported'` and `source_id IN (patientSourceIds)`. If the patient was already imported in a prior batch, the orphan flag is cleared and the appointment proceeds to `validated`.

After both passes, each staged row is transitioned: `markValidated` (pending → validated) or `markFailed` (pending → failed with `error_detail`). Transitions are guarded by the current status in the `WHERE` clause — a concurrent or out-of-order call cannot corrupt state, it throws `MigrationStagingError` instead.

`applyBatchValidation` returns `{ validated: number, failed: number }`.

### Stage 3 — Import (`importRecords`)

`packages/db/src/migration/upsert.ts → importRecords(tx, tenantId, sourceSystem, records, resolvers)`

Processes entity types in dependency order — parents before children — so ledger lookups for cross-record references always resolve within a single run:

```
patient → clinical_episode → appointment → clinical_record → attachment
```

For each record the importer checks the staging ledger:

| Ledger state | Action |
|---|---|
| Not staged at all | Fail with `invalid_transition` |
| `failed` | Skip (wait for re-stage) |
| `pending` | Fail with `invalid_transition` (stage + validate first) |
| `validated` | Insert into target table, `markImported` with the new row uuid |
| `imported` | Re-run path: UPDATE target table (except clinical records — see below) |

Each record's INSERT/UPDATE runs inside a savepoint (`tx.transaction()`). A failure rolls back that record only — one bad row never aborts the run. The error is sanitized (Postgres error messages can embed row values, so only the SQLSTATE code and constraint name are kept) and written to `error_detail`.

`importRecords` returns `ImportSummary`:

```ts
{ inserted: number; updated: number; skipped: number; failed: number;
  failures: Array<{ entityType, sourceId, detail }> }
```

**Resolvers** map symbolic keys to target UUIDs for data that already exists in OsteoJP (locations, practitioners, services). They are built once per run by the caller (query locations/users/services by slug) and passed to every entity importer.

---

## Edge cases and how the code handles them

### Duplicate patients

Fisiozero does not enforce uniqueness on name + date of birth. The same person can be registered multiple times across locations or by different receptionists.

**What the pipeline does:** duplicate Fisiozero records import as separate patient rows in OsteoJP. After the batch is imported, a human reviewer spots duplicates (reconciliation report, staff platform search) and calls `mergeImportedPatient(tx, { sourcePatientId, targetPatientId, actorId })`, which delegates to the existing `public.merge_patients()` SQL function (migration 0005). That function re-points all dependents (appointments, episodes, clinical records), soft-deletes the source patient, and writes an audit row. Merge logic is intentionally not reimplemented in the migration code.

**Do not delete** Fisiozero-sourced duplicate rows — use merge only.

### Missing required fields (NIF, date of birth)

Several Fisiozero patient records have incomplete mandatory fields. The intermediate shape `MigrationPatient` marks `dateOfBirth`, `nif`, and `sex` as nullable (`? | null`). Validation passes a patient record with a missing DOB; the target `patients` table column is nullable for the same reason.

What validation rejects: a `dateOfBirth` value that is non-null but not `YYYY-MM-DD`. An empty string `""` fails `isNonEmpty` and is treated as absent.

Patients with missing NIF or DOB land in OsteoJP and appear in the reconciliation report's `byEntityType` count. Staff (or JP) must complete those fields manually before the clinical record is considered complete.

### Orphan appointments

An appointment in Fisiozero that references a patient not present anywhere in the pipeline is an orphan. Two sub-cases:

1. **Patient is in the same batch** — resolved by `detectBatchIssues` in Pass 1. No DB lookup needed.
2. **Patient was imported in a prior batch** — `detectBatchIssues` flags it as an `unresolved_reference`; `applyBatchValidation` Pass 2 queries the staging ledger for `status = 'imported'` patient rows and clears the flag. The appointment validates successfully.
3. **Patient genuinely missing** — the appointment fails with `unresolved_reference` / field `patientSourceId`. It cannot be imported until the patient is staged and imported. Resolution: create the patient record (real or placeholder) and re-stage the appointment.

The per-field validation for `appointment.patientSourceId` (`isNonEmpty`) is a separate earlier gate — an appointment with a blank `patientSourceId` fails immediately in `validateMigrationRecord`, before the orphan check runs.

### Orphan clinical records and attachments

`importClinicalRecord` and `importAttachment` call `requireImportedRef` for their parent references. If the referenced patient (or clinical record, for attachments) is not yet imported, the import fails with `unresolved_reference` for that field. Because dependency order is enforced (`patient → clinical_episode → appointment → clinical_record → attachment`), a failed patient row cascades to fail all its dependents — they stay `validated` but fail at import time and are reported in `ImportSummary.failures`.

### Clinical records: skip on re-run, never overwrite

`importClinicalRecord` is the only entity importer that returns `"skipped"` instead of `"updated"` when the ledger has an `importedEntityId`. Migrated clinical history is treated as immutable — a locked record would be rejected by the immutability trigger in OsteoJP regardless, and silently rewriting a migrated draft would falsify clinical history. Re-running the import with the same records is always safe.

### Signed status cannot be imported

The `MigrationClinicalRecord.status` enum only allows `"draft"` or `"locked"`. A signature in OsteoJP attests a therapist's review *in this system* and cannot be carried over from Fisiozero. Whether historical records land as `draft` or `locked` is an open owner decision (see `docs/QUESTIONS.md`).

### Clinical record attachments

Fisiozero stores attachments as file paths on a local server (e.g. `/var/fisiozero/attachments/foo.pdf`). Moving bytes into Supabase Storage is a separate step that the pipeline does not perform — `importAttachment` expects `storagePath` to already be the *destination* object path in Supabase Storage (the column is `NOT NULL`). The attachment copy job is Phase 5 / Ivan's scope.

### Therapy type mapping (Fisiozero free-text → OsteoJP services)

The adapter (not yet implemented) is responsible for translating Fisiozero's free-text event types into `serviceKey` values. The importer resolves `serviceKey` through `MigrationResolvers.serviceIdByKey`.

| Fisiozero event type | OsteoJP service key |
|---|---|
| Osteopatia | `osteopatia` |
| Fisioterapia | `fisioterapia` |
| RPG | `rpg` |
| Massagem / Massagem Terapêutica | `massagem-terapeutica` |
| Pilates / Pilates Terapêutico | `pilates-terapeutico` |
| NESA | `nesa` |
| Unknown / blank | `null` (allowed; appointment lands without a service) |

`serviceKey` is optional in `MigrationAppointment`. An unknown event type that cannot be mapped should be set to `null` (not failed) so the appointment still imports — staff can correct the service association in the UI.

---

## Per-field validation rules

`packages/db/src/migration/validate.ts → validateMigrationRecord(rec)`

Returns `null` when valid, or a `MigrationErrorDetail` with `code: "validation_failed"` and the list of failing field paths.

| Entity | Required fields | Additional rules |
|---|---|---|
| `patient` | `sourceId`, `fullName`, `locationKeys` (array) | `dateOfBirth` optional but must be `YYYY-MM-DD` if present |
| `appointment` | `sourceId`, `patientSourceId`, `practitionerKey`, `locationKey`, `startsAt`, `endsAt`, `status` | Timestamps must parse as valid instants; `status` must be in the enum |
| `clinical_episode` | `sourceId`, `patientSourceId`, `title`, `status`, `openedAt` | `closedAt` optional but must be a valid instant if present |
| `clinical_record` | `sourceId`, `patientSourceId`, `data` (non-null object), `status` | `status` must be `"draft"` or `"locked"`; `recordedAt` optional |
| `attachment` | `sourceId`, `storagePath`, `fileName` | All other fields optional |

Error details are **PII-free**: they name field paths and error codes, never source values. Raw source values are in `migration_staging_rows.raw`, accessible to anyone with row access (i.e. admin/owner running under RLS).

---

## Reconciliation report

`packages/db/src/migration/reconciliation.ts → generateReconciliationReport(tx, tenantId, batchId)`

Runs three read-only queries against `migration_staging_rows` for a single batch:

1. **Status counts** — `GROUP BY status` → `byStatus: { pending, validated, imported, failed }`
2. **Entity-type counts** — `GROUP BY entity_type` → `byEntityType: { patient, appointment, clinical_episode, clinical_record, attachment }`
3. **Failed row list** — rows where `status = 'failed'`, ordered by `created_at` → `failedRows`

The returned `ReconciliationReport` type:

```ts
{
  batchId: string;
  generatedAt: string;           // ISO UTC timestamp
  totalRows: number;             // sum of all statuses
  byEntityType: Record<MigrationEntityType, number>;
  byStatus: Record<MigrationStagingStatus, number>;
  failedRows: ReconciliationFailedRow[];  // PII-free
  importedCount: number;         // alias for byStatus.imported
  pendingCount: number;          // alias for byStatus.pending
}
```

`failedRows` entries expose only `sourceId` (opaque source-system key), `entityType`, `errorCode`, and the offending field paths — never source values.

### Output formats

- **`reportToJson(report)`** — formatted JSON string (2-space indent).
- **`reportToMarkdown(report)`** — a markdown document with:
  - Summary table (total, imported, pending, validated, failed counts)
  - Per-entity-type bullet list
  - Failed rows table (`sourceId | entityType | errorCode | fields`)

### Interpreting the diff

After a batch runs, compare:

| Condition | Meaning |
|---|---|
| `pending > 0` | Batch stalled before validation or import; check pipeline logs |
| `validated > 0` | Staged and validated, but import has not run yet (normal mid-run state) |
| `failed > 0` | Records rejected; inspect `failedRows` for field names and error codes, fix source data, re-stage |
| `imported = totalRows` | Batch fully imported; no action needed |

A batch with `pending = 0`, `validated = 0`, `failed = 0`, `imported = totalRows` is clean.

---

## Health dashboard queries

`packages/db/src/migration/health.ts`

All four functions are read-only and take a `DbTx` from `withTenantContext`. They are intended for the admin UI (`apps/admin`) or a CLI health check script run by Ivan/Max during the migration window.

| Function | Returns | Query |
|---|---|---|
| `totalPatientsMigrated(tx, tenantId)` | `number` | `COUNT(*) WHERE entity_type='patient' AND status='imported'` |
| `totalAppointmentsMigrated(tx, tenantId)` | `number` | `COUNT(*) WHERE entity_type='appointment' AND status='imported'` |
| `batchSummary(tx, tenantId)` | `BatchSummaryEntry[]` (last 5) | Per-status pivot per batch, ordered by most-recently-updated row descending, capped at 5 |
| `pendingFailures(tx, tenantId)` | `number` | `COUNT(*) WHERE status='failed'` across all batches |

**`batchSummary` detail:** Each `BatchSummaryEntry` has `{ batchId, lastUpdatedAt, counts: { pending, validated, imported, failed } }`. "Last 5 batches" means the 5 with the most-recently-updated row — not the 5 most recently started. A stalled batch whose rows have not been touched since staging day will fall off the list if 5 newer batches run.

**`pendingFailures` signal:** A non-zero value means there are `failed` rows in the staging table that have not been re-staged. These represent data that will be absent from the platform until fixed and re-run. The recommended pre-import checklist: confirm `pendingFailures = 0` before starting the next batch.

---

## Staging table schema

`migration_staging_rows` (migration `0014_migration_staging.sql`):

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Row identifier |
| `tenant_id` | `uuid` FK → `tenants.id` | Tenant fence; RLS policy compares to JWT claim |
| `batch_id` | `uuid` | Caller-supplied batch identifier |
| `source_system` | `text` | `"fisiozero"` (or future systems) |
| `entity_type` | `migration_entity_type` enum | `patient / appointment / clinical_episode / clinical_record / attachment` |
| `source_id` | `text` | Source system's primary key for this record (opaque) |
| `raw` | `jsonb` | Untouched source payload — audit + replay |
| `status` | `migration_staging_status` enum | State machine: `pending → validated → imported` or `→ failed` |
| `error_detail` | `jsonb` (nullable) | PII-free error code + field names; null when not failed |
| `imported_entity_id` | `uuid` (nullable) | UUID of the created target row; set on `markImported`, preserved forever |
| `created_at` / `updated_at` | `timestamptz` | Audit timestamps |

Unique constraint: `(tenant_id, source_system, entity_type, source_id)` — one staging row per source record per tenant. This is the idempotency key: re-staging the same source row in a later batch upserts, not inserts.

Indexes: `(tenant_id, batch_id)` and `(tenant_id, status)` for the batch-scoped and status-scoped queries used by the reconciliation and health functions.

RLS: `tenant_id = (select public.jwt_tenant_id())` on both `USING` and `WITH CHECK`. Missing or invalid JWT → `jwt_tenant_id()` returns `NULL` → row invisible. No permissive fallback.

---

## Reconciliation sign-off procedure

1. Max runs `generateReconciliationReport` and outputs markdown → pastes into this file under the batch entry below.
2. Max runs spot-check against a 10 % random patient sample (name, DOB, phone match between Fisiozero export and OsteoJP profile).
3. Max documents findings in this file under the batch entry.
4. Max briefs JP on anomalies requiring clinical judgment (missing NIF, DOBs, duplicate flags).
5. JP reviews and signs off the batch.
6. Max marks the batch as accepted and updates the status table above.
7. If `pendingFailures > 0`, fix source data, re-stage affected rows, re-run import, and re-generate the reconciliation report before sign-off.

---

## Migration batch log

> Append each batch here as it runs. Format: date, batch ID, record counts, reconciliation markdown (pasted from `reportToMarkdown`), anomalies, sign-off status.

*(No batches run yet — Phase 5 not started.)*

---

## What remains for Phase 5 — Ivan's scope

The pipeline foundation (staging, validation, import, reconciliation, health) is complete and on `main`. The following is **blocked on Ivan** or on information that does not yet exist:

### 1. Fisiozero adapter (`source.ts — FisiozeroSource`)

The `FisiozeroSource` interface exists but is deliberately **unimplemented** (see `packages/db/src/migration/source.ts`). Implementation is blocked until a sample Fisiozero export arrives — the raw format (CSV+ZIP structure, column names, date formats, encoding) is unknown and guessing would bake wrong assumptions into the field mapper.

Once a sample export exists, Ivan needs to implement:
- `FisiozeroSource.records()` — an `AsyncIterable<SourceRecord>` that reads the export and maps each row into the intermediate `MigrationRecord` shape.
- Free-text event-type → `serviceKey` mapping (table above covers known cases).
- Attachment path normalization (`storagePath` for Supabase Storage destination).

### 2. Stylus.pt scheduling adapter

Stylus.pt has no structured export API — data must be scraped. Scope and volume unknown until Phase 5 begins. Ivan needs to confirm:
- Whether Stylus.pt has a hidden export endpoint or requires browser automation.
- Who at the clinic owns the Stylus.pt credentials.

### 3. Attachment copy job

The importer expects attachments to already be in Supabase Storage (`storagePath` is `NOT NULL`). Ivan needs to build a separate job that:
- Downloads files from the Fisiozero local server (requires server credentials — open question).
- Uploads them to the OsteoJP Supabase Storage bucket.
- Returns the final `storagePath` so the adapter can populate the intermediate `MigrationAttachment`.

Volume is unknown until scraping runs.

### 4. Import runner / CLI

`importRecords` is a library function; it needs a caller — an admin-only Next.js API route or a one-shot script that:
- Builds `MigrationResolvers` by querying live locations/users/services for the tenant.
- Calls `stageRows` → `applyBatchValidation` → `importRecords` → `generateReconciliationReport`.
- Writes the report to this file or sends it to Max for review.

### 5. Cutover decisions (owner questions — `docs/QUESTIONS.md`)

- What is the total patient record count in Fisiozero across both locations?
- Are historical clinical records (pre-2020) in scope for full migration or archive-only?
- What is the cutover date? (Affects which records need migration vs. read-only archive.)
- Should migrated clinical records land as `draft` or `locked`? (`locked` prevents any edits but cannot be `signed`; `draft` allows a therapist to review and sign in OsteoJP.)
- Who at the clinic owns the Fisiozero server credentials for scraper and attachment access?
- Does the clinic want a parallel-run window (both systems live) or a hard cutover?

---

## Open questions for Phase 5

- What is the total patient record count in Fisiozero across both locations?
- Are historical clinical records (pre-2020) in scope for migration or archive-only?
- What is the cutover date? (Affects which records need full migration vs read-only archive)
- Does Stylus.pt have an export function or does it require scraping?
- Who at the clinic owns the Fisiozero server credentials for scraper access?
- Should migrated clinical records land as `draft` or `locked`? (Open in `docs/QUESTIONS.md`)

## 2026-07-01 — Sex field normalization

Migration importer (`packages/db/src/migration/upsert.ts`) passes sex through with no normalization. When the Fisiozero CSV+ZIP source adapter is built, it must normalize sex to canonical values (male/female/other). Map: F/feminino/Feminino/f -> female, M/masculino/Masculino/m -> male. Fix at the migration boundary, not in `deriveFigSex`. Not a live bug — no migration has run yet.

## 2026-07-01 — i18n file location correction

i18n source files are at `packages/i18n/src/strings.pt.json` and `packages/i18n/src/strings.en.json`. The `packages/i18n/strings.*.json` path (without `/src/`) does not exist. All tooling and prompts must use the `/src/` path.
