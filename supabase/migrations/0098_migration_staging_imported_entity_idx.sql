-- AUTO-GENERATED — DO NOT EDIT.
-- Mirror of packages/db/migrations/0098_migration_staging_imported_entity_idx.sql for Supabase branching.
-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs

/* ====================================================================== */
/* MIGRATION STAGING: an index on the importer ledger's target column,    */
/* so a lookup BY TARGET ROW stops reading the whole ledger.              */
/*                                                                        */
/* Ruled 0097 and HELD, per the SOLO dispatch of 2026-09-27, which        */
/* relays the owner's ruling that 0097 and 0098 are authored now and      */
/* applied later by GREEN. The build lane never applies it. It is         */
/* applied only AFTER 0094, 0095 AND 0096, in that order.                 */
/*                                                                        */
/* RULED NUMBER 0097. NO NUMBER IN THIS FILE NAME YET, BY CONSTRUCTION.   */
/* It must follow 0096 (the conflict check's patient name). See           */
/* packages/db/migrations-pending/README.md for the promotion recipe;     */
/* the body below is final.                                               */
/*                                                                        */
/* AT PROMOTION its journal `when` MUST BE STRICTLY GREATER THAN 0096's.  */
/* A `when` that is equal or lower makes drizzle skip the file in         */
/* silence, which is why scripts/check-journal.mjs refuses one.           */
/* ====================================================================== */


/* ====================================================================== */
/* 1. WHAT THIS FILE MAKES TRUE                                           */
/* ====================================================================== */
/* One btree index, migration_staging_imported_entity_idx, on             */
/* public.migration_staging_rows (imported_entity_id, entity_type),       */
/* partial WHERE imported_entity_id IS NOT NULL, and a COMMENT on it.     */
/* Nothing else: no table, column, policy, grant, function or row moves.  */


/* ====================================================================== */
/* 2. THE READER IT IS FOR                                                */
/* ====================================================================== */
/* importerSourcedRecordSql (apps/web/lib/clinical/record-origin.ts       */
/* :74-79) asks whether the importer's ledger names a record, or any      */
/* record its supersedes chain reaches:                                   */
/*                                                                        */
/*   where ledger.entity_type = 'clinical_record'                         */
/*     and ledger.imported_entity_id in (select chain.id from chain)      */
/*                                                                        */
/* apps/web/app/clinical/[id]/page.tsx:65 runs it each time a record      */
/* without a form template is opened. The table's four indexes            */
/* (0014_migration_staging.sql:4, :16, :20, :21) are the primary key and  */
/* three that lead with tenant_id; none holds imported_entity_id. So      */
/* every probe reads every ledger row of the viewer's tenant (all of      */
/* them, with one tenant): a sequential scan that grows with the import   */
/* and not with the answer.                                               */


/* ====================================================================== */
/* 3. EVERY READER OF imported_entity_id (git grep, main e674100b)        */
/* ====================================================================== */
/* PROBES, which look a row up BY imported_entity_id. This index serves   */
/* every one:                                                             */
/*   P1 apps/web/lib/clinical/record-origin.ts:77-78                      */
/*      entity_type = const AND imported_entity_id IN (the chain)         */
/*   P2 scripts/reminder-lv-2026-09-12-1100-read.sql:101-103, :110-111    */
/*      entity_type AND imported_entity_id IN (a subquery)                */
/*   P3 scripts/reminder-outside-app-read-2026-09-13.sql:164-166,         */
/*      :172-174 and :200-203; tenant_id, entity_type AND                 */
/*      imported_entity_id IN (a subquery), or = a joined id              */
/*   P4 apps/web/lib/clinical/record-origin.db.test.ts:215 (with          */
/*      entity_type) and :224 (with tenant_id and NO entity_type)         */
/*   P5 packages/db/tests/migration-batch-import.test.ts:351-353, a join  */
/*      ON imported_entity_id = appointments.id                           */
/*                                                                        */
/* PROJECTIONS AND SWEEPS, which read the column but select their rows    */
/* by tenant, batch, status, source id or entity_type, or sweep the       */
/* ledger. The index is not for them:                                     */
/*   packages/db/src/migration/reconciliation.ts:173-197 and :221-223     */
/*   packages/db/scripts/import-core.ts:525-536                           */
/*   packages/db/src/migration/staging.ts:411-425 (resolveImportedIds)    */
/*   packages/db/src/migration/upsert.ts:1025-1040 (loadStagingRows)      */
/*   scripts/data/anexo-link-1-preview.sql:39-49                          */
/*   scripts/data/anexo-link-2-apply.sql:83-93                            */
/*   scripts/import/cb-reconciliation.sql, cb-recovery-diagnostics.sql,   */
/*   long-telefone-five.sql, notes-1027-provenance.sql and                */
/*   recover-221754.sql                                                   */
/*                                                                        */
/* THE WRITERS, both in packages/db/src/migration/staging.ts:             */
/* markImported (:179-205, through transition()) and markImportedMany     */
/* (:246-257). Each sets imported_entity_id in the same UPDATE that sets  */
/* status. status is already indexed (tenant_status_idx), so neither      */
/* UPDATE was ever a HOT update; this index adds one entry per row that   */
/* gains a target, and changes no write path.                             */


/* ====================================================================== */
/* 4. WHY (imported_entity_id, entity_type), IN THAT ORDER                */
/* ====================================================================== */
/* imported_entity_id is the id of the target row, so it is as good as    */
/* unique, and every probe in section 3 compares it with = or IN or a     */
/* join. P4's second query and P5 name no entity_type at all.             */
/*                                                                        */
/* UNDER ROW LEVEL SECURITY THE OTHER ORDER IS NEVER USED. MEASURED on a  */
/* throwaway database at 0096 (Postgres 17.6, 20000 seeded ledger rows,   */
/* ANALYZEd, the P1 query run as `authenticated` with a tenant claim, as  */
/* withTenantContext runs it).                                            */
/* The enum `=` (enum_eq) is not LEAKPROOF, so Postgres may not use       */
/* `entity_type = 'clinical_record'` as an index condition ahead of the   */
/* table's tenant policy; uuid `=` (uuid_eq) is leakproof and may be      */
/* used. With entity_type leading, the index had no usable first column   */
/* and the plan stayed a Seq Scan. With imported_entity_id leading, it is */
/* an Index Scan on this index, Index Cond imported_entity_id = the       */
/* chain id, and entity_type and tenant_id are checked on the one row     */
/* each probe returns. Postgres 17 has no skip scan to rescue the other   */
/* order.                                                                 */
/*                                                                        */
/* entity_type stays as the second key column for the readers that run    */
/* without the policy (P2, P3 and P4 connect with a role that bypasses    */
/* row level security): for them both columns are index conditions, and   */
/* P1 run that way is an Index Only Scan. It costs four bytes an entry.   */
/*                                                                        */
/* tenant_id is not in the key. Under the policy it is a filter on the    */
/* row or two a probe returns.                                            */


/* ====================================================================== */
/* 5. WHY PARTIAL                                                         */
/* ====================================================================== */
/* Every probe compares imported_entity_id with a strict operator, so a   */
/* NULL never matches; the planner proves imported_entity_id IS NOT NULL  */
/* from the probe itself (MEASURED: P1 above uses this partial index).    */
/* The rows it leaves out, those not yet imported or failed, are rows no  */
/* probe can return. The two readers that ask for IS NULL                 */
/* (scripts/import/cb-reconciliation.sql:181 and                          */
/* packages/db/tests/migration-upsert-idempotency.test.ts:219) find       */
/* their rows by tenant and status, which tenant_status_idx serves.       */


/* ====================================================================== */
/* 6. NOT CONCURRENTLY, AND WHY THAT IS FORCED                            */
/* ====================================================================== */
/* drizzle's pg migrator runs every pending migration inside ONE          */
/* transaction (drizzle-orm 0.45.2, pg-core/dialect.js, migrate(): the    */
/* loop over migrations sits inside session.transaction). CREATE INDEX    */
/* CONCURRENTLY refuses to run inside a transaction block, so it would    */
/* fail the apply. The plain form it is, as 0068 and 0091 did.            */
/*                                                                        */
/* The plain form holds a SHARE lock on migration_staging_rows while it   */
/* builds: reads go on, writes wait. The only writer is the importer,     */
/* which the owner runs and which does not run during an apply sitting.   */


/* ====================================================================== */
/* 7. IDEMPOTENT, AND WHAT IF NOT EXISTS DOES NOT SEE                     */
/* ====================================================================== */
/* Run twice, the CREATE is a no-op with a NOTICE (IF NOT EXISTS) and     */
/* the COMMENT sets the same text again. IF NOT EXISTS matches the NAME   */
/* only, against every relation in the schema, so the                     */
/* pre-check proves that no relation of this name exists AND that no      */
/* index on the table already keys imported_entity_id under another       */
/* name.                                                                  */


/* ====================================================================== */
/* 8. WHAT THIS FILE DOES NOT DO                                          */
/* ====================================================================== */
/* - It edits no reader. The planner picks the index; record-origin.ts    */
/*   and the scripts stay as they are.                                    */
/* - It is not mirrored in packages/db/src/schema.ts, like 0068's         */
/*   appointments_patient_2_idx and 0091's patient_care_team indexes.     */
/*   drizzle-kit generate diffs schema.ts against its own snapshots, not  */
/*   the database, so it never emits a DROP for an index it never knew.   */


CREATE INDEX IF NOT EXISTS "migration_staging_imported_entity_idx"
  ON public.migration_staging_rows USING btree ("imported_entity_id", "entity_type")
  WHERE "imported_entity_id" IS NOT NULL;--> statement-breakpoint

COMMENT ON INDEX public.migration_staging_imported_entity_idx IS
  '0097. Serves lookups of the importer ledger by target row: '
  'apps/web/lib/clinical/record-origin.ts importerSourcedRecordSql '
  '(entity_type and imported_entity_id IN the supersedes chain) and every '
  'other probe of imported_entity_id. imported_entity_id leads because '
  'entity_type cannot be an index condition under row level security. '
  'Partial because a NULL is never probed. Plain CREATE INDEX because '
  'drizzle runs every pending migration inside one transaction.';
