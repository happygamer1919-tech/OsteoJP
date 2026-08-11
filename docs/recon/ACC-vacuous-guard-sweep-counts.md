# ACC-vacuous-guard-sweep - COUNTS

Generated 2026-08-11 from `origin/main` at 56d54ce by a mechanical scan.
Counts only. Nothing is fixed and nothing is characterised.

## Detection is MECHANICAL, and its precision is stated so the numbers are not over-read

Each category is a regex-level proxy, not a confirmed vacuous assertion. A hit
means "has the SHAPE that produced the three known defects", and every hit needs
a human read before it is called vacuous. The counts are an upper bound on
suspicion, not a count of proven defects.

- **(A) self-mocking**: the file calls `vi.mock("./x")` AND imports from `./x`.
  This is exactly the shape of `pedido-confirm.test.ts:42`. It is ALSO the shape
  of legitimately stubbing a side-effect module such as `./audit`, so this
  category has known false positives.
- **(B) unstripped comments**: the file calls `readFileSync` and asserts on the
  text without a comment-stripping `replace`. This is the shape of
  `supabase-email-templates.test.ts:30`, where the only occurrence of the
  asserted string was inside the comment warning against it.
- **(C) no negative arm**: no `.not.`, `rejects.`, `toThrow`, `toBe(false)`,
  `toBe(0)`, `toHaveLength(0)`, `toBeNull` or `toBeUndefined` anywhere in the
  file. A suite that only ever asserts the happy path cannot fail in the
  direction that matters.

## Plus two CI defects already shipped in #861, counted separately

A suite excluded by explicit path is the LIMIT CASE of a guard that cannot
fail: it cannot even run.

1. `.github/workflows/db-tests.yml` ran the apps/web DB step against
   `redeem.db.test.ts` **by explicit path**, so any new `.db.test.ts` in
   apps/web would have been committed, reviewed, merged and never executed.
2. `.github/scripts/assert-rls-executed.mjs` did not hard-require
   `pedido-confirm.db.test.ts`, so a silent skip would have reported green.

## The numbers

FILES SCANNED: 385

(A) SELF-MOCKING - mocks a module it also imports and asserts through: 24
    apps/web/lib/admin/appointment-delete-password.test.ts:7  vi.mock("./tenant-secret") + imports the same module
    apps/web/lib/admin/locations.delete.test.ts:10  vi.mock("./audit") + imports the same module
    apps/web/lib/admin/staff-locations.test.ts:12  vi.mock("./audit") + imports the same module
    apps/web/lib/admin/staff.delete.test.ts:20  vi.mock("./audit") + imports the same module
    apps/web/lib/admin/staff.delete.test.ts:21  vi.mock("./appointment-delete-password") + imports the same module
    apps/web/lib/admin/staff.edit.test.ts:27  vi.mock("./audit") + imports the same module
    apps/web/lib/admin/tenant-secret.test.ts:10  vi.mock("./audit") + imports the same module
    apps/web/lib/admin/therapist-primary-service.test.ts:12  vi.mock("./audit") + imports the same module
    apps/web/lib/admin/time-off-batch.test.ts:13  vi.mock("./audit") + imports the same module
    apps/web/lib/clinical/records.hard-delete.test.ts:20  vi.mock("../auth/context") + imports the same module
    apps/web/lib/clinical/records.hard-delete.test.ts:23  vi.mock("./audit") + imports the same module
    apps/web/lib/clinical/terms-acceptance.test.ts:17  vi.mock("./audit") + imports the same module
    apps/web/lib/patients/actions.append-appointment-note.test.ts:20  vi.mock("../auth/context") + imports the same module
    apps/web/lib/patients/actions.append-appointment-note.test.ts:26  vi.mock("./queries") + imports the same module
    apps/web/lib/patients/actions.edit-appointment-note.test.ts:12  vi.mock("../auth/context") + imports the same module
    apps/web/lib/patients/actions.edit-appointment-note.test.ts:18  vi.mock("./queries") + imports the same module
    apps/web/lib/patients/actions.hard-delete.test.ts:12  vi.mock("../auth/context") + imports the same module
    apps/web/lib/patients/actions.hard-delete.test.ts:16  vi.mock("./audit") + imports the same module
    apps/web/lib/scheduling/actions.hard-delete.test.ts:15  vi.mock("./audit") + imports the same module
    apps/web/lib/scheduling/actions.post-commit.test.ts:29  vi.mock("./reminders") + imports the same module
    apps/web/lib/scheduling/actions.status-event.test.ts:21  vi.mock("./analytics") + imports the same module
    apps/web/lib/scheduling/pedido-confirm.test.ts:37  vi.mock("./audit") + imports the same module
    apps/web/lib/scheduling/pedido-confirm.test.ts:42  vi.mock("./conflict") + imports the same module
    apps/web/lib/statistics/queries.test.ts:8  vi.mock("../auth/context") + imports the same module

(B) READS SOURCE WITHOUT STRIPPING COMMENTS: 25
    apps/api/lib/appointments/past-slot-floor.test.ts:27  readFileSync + asserts on text, comments NOT stripped
    apps/api/lib/appointments/preselection.test.ts:114  readFileSync + asserts on text, comments NOT stripped
    apps/api/lib/appointments/write-paths.test.ts:98  readFileSync + asserts on text, comments NOT stripped
    apps/api/lib/auth/degradation-copy.test.ts:20  readFileSync + asserts on text, comments NOT stripped
    apps/portal/lib/api/api-method-parity.test.ts:73  readFileSync + asserts on text, comments NOT stripped
    apps/portal/lib/api/base.test.ts:87  readFileSync + asserts on text, comments NOT stripped
    apps/portal/lib/auth/device-cookie-parity.test.ts:51  readFileSync + asserts on text, comments NOT stripped
    apps/web/app/clinical/[id]/RecordForm.test.tsx:64  readFileSync + asserts on text, comments NOT stripped
    apps/web/lib/admin/services-patient-bookable.test.ts:128  readFileSync + asserts on text, comments NOT stripped
    apps/web/lib/auth/supabase-email-templates.test.ts:55  readFileSync + asserts on text, comments NOT stripped
    apps/web/lib/clinical/consent-terms-axis.test.ts:82  readFileSync + asserts on text, comments NOT stripped
    apps/web/lib/clinical/declaracao/declaracao-pdf.test.ts:105  readFileSync + asserts on text, comments NOT stripped
    apps/web/lib/clinical/form-template.test.ts:173  readFileSync + asserts on text, comments NOT stripped
    apps/web/lib/notifications/centre.test.ts:175  readFileSync + asserts on text, comments NOT stripped
    apps/web/lib/notifications/pending-requests.test.ts:154  readFileSync + asserts on text, comments NOT stripped
    apps/web/lib/reminders/approval-packet.test.ts:21  readFileSync + asserts on text, comments NOT stripped
    apps/web/lib/reminders/fee-notice.test.ts:104  readFileSync + asserts on text, comments NOT stripped
    apps/web/lib/scheduling/pedido-confirm.test.ts:266  readFileSync + asserts on text, comments NOT stripped
    packages/db/tests/journal-sync.test.ts:41  readFileSync + asserts on text, comments NOT stripped
    packages/db/tests/migration-syntax.test.ts:58  readFileSync + asserts on text, comments NOT stripped
    packages/db/tests/private-notes-template-guard.test.ts:41  readFileSync + asserts on text, comments NOT stripped
    packages/db/tests/slot-lock-concurrency.test.ts:232  readFileSync + asserts on text, comments NOT stripped
    packages/ui/src/tokens-therapist-palette.test.ts:19  readFileSync + asserts on text, comments NOT stripped
    packages/ui/src/tokens-v2.test.ts:11  readFileSync + asserts on text, comments NOT stripped
    packages/ui/src/tokens.test.ts:11  readFileSync + asserts on text, comments NOT stripped

(C) NO NEGATIVE ARM ANYWHERE IN THE FILE: 74
    apps/admin/lib/tenants.test.ts  no negative arm anywhere in the file
    apps/api/app/api/health/route.test.ts  no negative arm anywhere in the file
    apps/api/lib/appointments/past-slot-floor.test.ts  no negative arm anywhere in the file
    apps/api/lib/appointments/write-paths.test.ts  no negative arm anywhere in the file
    apps/api/lib/auth/patient-linkage.test.ts  no negative arm anywhere in the file
    apps/api/lib/intake/catalog.test.ts  no negative arm anywhere in the file
    apps/portal/app/manifest.test.ts  no negative arm anywhere in the file
    apps/portal/lib/api/api-method-parity.test.ts  no negative arm anywhere in the file
    apps/web/e2e/admin-danger-zone.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/admin-packs.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/agenda-block-slot.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/agenda-blocked-time.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/agenda-deeplink-patient.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/agenda-header.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/agenda-hover.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/agenda-week-6day.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/appointment-hard-delete.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/booking-packs.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/booking-service-preselection.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/camera-to-ficha.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/consultation-start.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/dashboard.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/deleted-patients.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/equipa-location-filter.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/equipa-primary-service.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/estatisticas.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/ficha-signature-consent.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/guiao-panel.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/horarios.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/invoicing.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/isolation-therapist.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/location-auto-select.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/location-delete.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/marcacao-audit-notes.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/marcacao-patient-link.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/marcacoes-open-edit.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/marcacoes-service-filter.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/nif-required.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/notes-unification.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/patient-documents.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/patients.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/profile-reachability.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/profile.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/recording.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/reminders.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/revisao-consulta.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/services-delete.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/staff-contact-fields.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/staff-primary-service.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/therapist-blocks.spec.ts  no negative arm anywhere in the file
    apps/web/e2e/therapist-self-lock.spec.ts  no negative arm anywhere in the file
    apps/web/lib/admin/time-off-batch-form.test.ts  no negative arm anywhere in the file
    apps/web/lib/clinical/report/clinic-fiscal.test.ts  no negative arm anywhere in the file
    apps/web/lib/clinical/report/pdf.test.ts  no negative arm anywhere in the file
    apps/web/lib/clinical/rgpd/rgpd.test.ts  no negative arm anywhere in the file
    apps/web/lib/integrations/invoicexpress/profile.test.ts  no negative arm anywhere in the file
    apps/web/lib/packs/instances-core.test.ts  no negative arm anywhere in the file
    apps/web/lib/patients/format.test.ts  no negative arm anywhere in the file
    apps/web/lib/patients/notes-merge.test.ts  no negative arm anywhere in the file
    apps/web/lib/reminders/inngest/functions.test.ts  no negative arm anywhere in the file
    apps/web/lib/reminders/locale.test.ts  no negative arm anywhere in the file
    apps/web/lib/reminders/offsets.test.ts  no negative arm anywhere in the file
    apps/web/lib/reminders/reminder-copy.test.ts  no negative arm anywhere in the file
    apps/web/lib/scheduling/batch-failure-core.test.ts  no negative arm anywhere in the file
    apps/web/lib/scheduling/day-availability.test.ts  no negative arm anywhere in the file
    apps/web/lib/scheduling/intervals.test.ts  no negative arm anywhere in the file
    apps/web/lib/scheduling/lote.test.ts  no negative arm anywhere in the file
    apps/web/lib/scheduling/nesa.test.ts  no negative arm anywhere in the file
    packages/db/tests/journal-sync.test.ts  no negative arm anywhere in the file
    packages/db/tests/slot-granularity.test.ts  no negative arm anywhere in the file
    packages/db/tests/slot-lock-concurrency.test.ts  no negative arm anywhere in the file
    packages/db/tests/statistics-aggregates.test.ts  no negative arm anywhere in the file
    packages/db/tests/working-hours-real.test.ts  no negative arm anywhere in the file
    packages/ui/src/tokens-therapist-palette.test.ts  no negative arm anywhere in the file
