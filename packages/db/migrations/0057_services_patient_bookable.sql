/* ================================================================== */
/* 0057 — services.patient_bookable (W13-04, Wave 13 LOOP 4)          */
/*                                                                    */
/* Decision B (WAVE-13.md section 1.4): "patient_bookable replaces the */
/* name allowlist." Which services a patient may self-book online is   */
/* currently decided in CODE, by four hard-coded normalized names in   */
/* apps/api/lib/appointments/services.ts:39-44. This column moves that */
/* decision into the row it describes, where staff can maintain it.    */
/*                                                                    */
/* NUMBER DERIVED AT AUTHORING, never pre-assigned (section 1.5). The  */
/* journal packages/db/migrations/meta/_journal.json holds 56 entries  */
/* ending at idx 55, tag 0056_patient_auth_storage; both mirrored      */
/* trees (packages/db/migrations, supabase/migrations) hold 56 .sql    */
/* files and an identical file list. Next free is 0057, journal idx 56.*/
/* The global in-flight slot is free: 0056 was applied and verified    */
/* against production on 2026-08-05 and merged in #817.               */
/*                                                                    */
/* WHY A THIRD FLAG RATHER THAN OVERLOADING ONE, which the 0046        */
/* is_bookable migration argued for staff and applies identically here.*/
/* Three concerns, three signals:                                      */
/*   is_active       — does this service exist at all                  */
/*   internal_only   — may staff book it while the portal never shows it*/
/*   patient_bookable— may a PATIENT self-book it online               */
/* Collapsing any two of these means a clinic cannot express a service */
/* that is real, staff-bookable, and not offered for self-booking —    */
/* which is most of the catalog.                                       */
/*                                                                    */
/* THE BACKFILL MUST NOT CHANGE WHAT ANY PATIENT CAN BOOK ON THE DAY   */
/* IT APPLIES. That is LOOP 4's stated definition of done, and it is   */
/* the reason the WHERE clause below reproduces normalizeServiceName's */
/* exact semantics rather than matching on the display names:          */
/*   strip accents, lowercase, collapse whitespace, trim.              */
/* A service stored as "Pilates Terapêutico", "  PILATES  TERAPEUTICO" */
/* or "pilates terapeutico" is one row to the application today and    */
/* must be one row to this UPDATE.                                     */
/*                                                                    */
/* translate(), NOT unaccent(). The unaccent extension is available on */
/* this Postgres but NOT installed, and installing an extension to run */
/* one backfill adds a permanent dependency for a one-off statement.   */
/* The Portuguese accented set is small, closed and known, so it is    */
/* spelled out. This is deterministic on every deployment, which an    */
/* extension installed by a migration on some databases and not others */
/* would not be.                                                       */
/*                                                                    */
/* DEFAULT false, so a NEW service is not self-bookable until someone  */
/* says so. Same fail-closed default as 0046, and the same reasoning:  */
/* the failure of a service missing from the portal is a phone call,   */
/* the failure of an unintended service appearing in it is a patient   */
/* booking something the clinic never offered them.                    */
/*                                                                    */
/* TENANT SCOPE IS EXPLICIT, per hard rule 3 — and it covers EVERY     */
/* tenant, which is the point rather than an oversight. The allowlist  */
/* this replaces lives in application code with no tenant dimension at */
/* all: it applied to every tenant equally. A backfill scoped to one   */
/* tenant would therefore CHANGE behaviour for all the others, turning */
/* their bookable services off, which is exactly what the             */
/* behaviour-neutrality requirement forbids. The join onto tenants     */
/* names tenant_id in the predicate so the breadth is deliberate and   */
/* auditable, not an accidental unqualified UPDATE.                    */
/*                                                                    */
/* NOTHING ELSE CHANGES IN THIS MIGRATION. The allowlist deletion, the */
/* two call-site replacements and the missing internal_only check at   */
/* getBookableService all land together in ONE later PR (LOOP 4 step   */
/* 4), because deleting the allowlist is what removes the mask over    */
/* the exposure described in WAVE-13.md section 1.4.1. This file only  */
/* adds a column and fills it; on its own it changes no behaviour at   */
/* all, which is what makes it safe to apply before that PR exists.    */
/*                                                                    */
/* services keeps tenant_id and its existing RLS unchanged (column-only */
/* add), so no policy is added, altered or re-granted here.            */
/* ================================================================== */

ALTER TABLE "services" ADD COLUMN "patient_bookable" boolean DEFAULT false NOT NULL;--> statement-breakpoint

/* The four names of BOOKABLE_SERVICE_NAMES, already normalized. RPG is
   deliberately absent: it is the RGPD consent document, not a service
   (JP ruling 2026-07-11). */
UPDATE "services" AS s
   SET "patient_bookable" = true
  FROM "tenants" AS t
 WHERE s."tenant_id" = t."id"
   AND regexp_replace(
         btrim(
           lower(
             translate(
               s."name",
               'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
               'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
             )
           )
         ),
         '\s+', ' ', 'g'
       ) IN (
         'osteopatia',
         'fisioterapia',
         'massagem terapeutica',
         'pilates terapeutico'
       );--> statement-breakpoint

/* The portal catalog query filters on tenant + is_active + internal_only
   and will filter on this column too. Indexed alongside them rather than
   alone, because it is never the only predicate. */
CREATE INDEX IF NOT EXISTS "services_tenant_patient_bookable_idx"
  ON "services" ("tenant_id", "patient_bookable");
