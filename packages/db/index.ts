export * from "./src/schema";
export {
  getDbAdmin,
  withTenantContext,
  withPatientContext,
  type DbTx,
  type TenantClaims,
  type PatientClaims,
} from "./src/client";

// Canonical-role seeder — consumed by the tenant-create path (apps/web
// lib/auth/provision.ts). The package `exports` map only exposes ".", so the
// seeder is surfaced here rather than via a deep import.
export {
  seedTenantRoles,
  CANONICAL_ROLES,
  type SeedRoleAction,
  type SeedRoleResult,
} from "./seed/roles";

// Shared tenant onboarding entry point — used by the staff platform and the
// superadmin app. One implementation so the tenant + roles + audit invariant
// cannot drift between callers.
export { provisionTenant, type ProvisionTenantResult } from "./src/provision";

// Data migration pipeline foundation (Phase 5) — intermediate types, staging
// + idempotency ledger, importer, and the unimplemented Fisiozero adapter seam.
export * from "./src/migration";

// GUEST-04 — what 0063's requested_starts_at/_ends_at pair MEANS under the
// Option A ruling. Exported from the package rather than from either app
// because apps/api writes the pair and apps/web reads it, and a copy in each is
// how the two would come to disagree about what a window says.
export * from "./src/guest-preferred-window";
// The public form's optional email (0101): the portal and the API validate with
// this one rule, and it is the staff app's rule (tests/guest-email.test.ts).
export * from "./src/guest-email";

// RB-01 — the recuperacao selection predicate. Exported from the package for
// the reason `guest-preferred-window` above is: its two readers are the staff
// query in apps/web and the DB-gated test that proves it against real Postgres,
// and a copy in each is how a selection rule and its proof come to disagree.
export * from "./src/followup-selection";

// RB-02 — what a pacote's balance IS. Exported from the package because the
// staff query, the booking guard and the DB-gated test must all agree on one
// formula, and because `legacy_consumed` only makes sense next to the reasoning
// that produced it.
export * from "./src/pack-balance";

// SCHED-17 - whether the NESA migration's column exists yet. Exported from the
// package because both apps read it (the staff paths in apps/web and the portal
// roster in apps/api), and each keeping its own check is how they would come to
// disagree about whether NESA exists.
export * from "./src/shared-resource";

// HOR-01 - each clinic's Saturday hours (opening AND closing time), read only
// once its held migration (HOR-02) exists on the database. Exported from the
// package for the reason `shared-resource` above is: a presence check kept in
// two places is how two readers come to disagree about whether the columns
// exist.
export * from "./src/location-saturday";

// INTAKE-01 - whether 0087's guest_clinical_intakes table exists yet, and the
// one write of an intake row. Exported from the package for the reason
// `shared-resource` above is: the guest route and catalog (apps/api), the portal
// read and the staff views all gate on the same answer, and each keeping its
// own check is how they would come to disagree about whether the intake exists.
export * from "./src/guest-intake";
export * from "./src/guest-intake-staff";

// RGPD-01 - whether the pending patient_rgpd_acceptances table exists yet.
// Exported from the package for the reason `guest-intake` above is: the ficha
// read and the creation form both gate on the same answer, and each keeping its
// own check is how they would come to disagree about whether the table exists.
export * from "./src/rgpd-acceptance-schema";

// BLOQUEIOS DE REPETICAO SEMANAL - whether the pending therapist_weekly_blocks
// table exists yet. Exported from the package for the reason `shared-resource`
// above is: the staff conflict check, the agenda band, the availability read
// and the patient portal (apps/api) all gate on the same answer, and each
// keeping its own check is how they would come to disagree about whether a
// weekly rule can block anything.
export * from "./src/weekly-blocks-schema";

// TIPOS DE MARCACAO - the allowed values of the five services columns the
// pending migration NEXT-AFTER-0109_services_booking_type_fields adds (VAT
// rate, exemption reason, follow-up, colour). Exported from the package because
// the schema CHECKs, the admin screen and its server action must name one list.
export * from "./src/service-type-fields";
