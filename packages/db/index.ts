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

// INTAKE-01 - whether 0087's guest_clinical_intakes table exists yet, and the
// one write of an intake row. Exported from the package for the reason
// `shared-resource` above is: the guest route and catalog (apps/api), the portal
// read and the staff views all gate on the same answer, and each keeping its
// own check is how they would come to disagree about whether the intake exists.
export * from "./src/guest-intake";
export * from "./src/guest-intake-reads";
