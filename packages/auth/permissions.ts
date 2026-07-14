// Role → capability matrix for OsteoJP.
//
// This file is the app-layer source of truth for who-can-do-what *within* a
// tenant. The tenant wall and the clinical-records gate (owner/admin/therapist
// may touch clinical_records, reception may not) are also enforced by Postgres
// RLS in packages/db — that is defense in depth. All other intra-tenant role
// rules live here and are enforced by server actions / API routes before any
// DB call.

export const ROLES = ["owner", "admin", "therapist", "reception"] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

// Validates the untyped `user_role` JWT claim. Returns null on anything
// invalid (missing claim, typo, unknown role). Caller decides whether that's
// a 401/403 (untrusted input) or a 500 (server-issued JWT we don't recognize).
// Never throws — fail-closed at the call site, not here.
export function parseRole(value: unknown): Role | null {
  return isRole(value) ? value : null;
}

export type Capability =
  | "patients:read"
  | "patients:write"
  | "patients:delete"
  // Owner-only (W6-04): reach the "Pacientes eliminados" recovery view (list /
  // restore soft-deleted + duplicate-marked patients). Tighter than
  // patients:delete (which admins/therapists also hold); this management surface
  // is owner-only.
  | "patients:recover"
  | "appointments:read"
  | "appointments:write"
  | "appointments:delete"
  | "services:read"
  | "services:write"
  | "locations:read"
  | "locations:write"
  | "clinical_records:read"
  | "clinical_records:author"
  | "clinical_records:review"
  | "clinical_records:sign"
  | "invoices:read"
  | "invoices:issue"
  | "invoices:void"
  | "users:read"
  | "users:manage"
  | "roles:read"
  | "roles:manage"
  | "settings:read"
  | "settings:manage"
  | "audit_log:read"
  // Owner-only (W6-05): reach the Estatisticas KPI dashboard (revenue + volume
  // aggregates). Owner-only, enforced route-level AND query-level.
  | "statistics:read";

const ALL_CAPABILITIES: readonly Capability[] = [
  "patients:read",
  "patients:write",
  "patients:delete",
  "patients:recover",
  "appointments:read",
  "appointments:write",
  "appointments:delete",
  "services:read",
  "services:write",
  "locations:read",
  "locations:write",
  "clinical_records:read",
  "clinical_records:author",
  "clinical_records:review",
  "clinical_records:sign",
  "invoices:read",
  "invoices:issue",
  "invoices:void",
  "users:read",
  "users:manage",
  "roles:read",
  "roles:manage",
  "settings:read",
  "settings:manage",
  "audit_log:read",
  "statistics:read",
];

export const PERMISSIONS: Record<Role, ReadonlySet<Capability>> = {
  // Owner: unrestricted within their tenant. Only role that can manage other
  // roles — prevents privilege escalation by a compromised admin.
  owner: new Set<Capability>(ALL_CAPABILITIES),

  // Admin: full operational control, but does NOT author/review/sign clinical
  // records (oversight role, not clinician) and CANNOT manage roles. Reviewing
  // and finalizing the AI/patient intake queue is a clinician action, so it is
  // therapist/owner only — admin keeps read-only clinical access.
  admin: new Set<Capability>([
    "patients:read",
    "patients:write",
    "patients:delete",
    "appointments:read",
    "appointments:write",
    "appointments:delete",
    "services:read",
    "services:write",
    "locations:read",
    "locations:write",
    "clinical_records:read",
    "invoices:read",
    "invoices:issue",
    "invoices:void",
    "users:read",
    "users:manage",
    "roles:read",
    "settings:read",
    "settings:manage",
    "audit_log:read",
  ]),

  // Therapist (clinician): patient + appointment work, full clinical-record
  // authoring + signing, AND reviewing the queue of AI-ingested drafts /
  // patient-submitted intake (claim → edit narrative → finalize). Read-only on
  // services/locations/invoices. No settings, no user/role admin, no
  // destructive actions.
  therapist: new Set<Capability>([
    "patients:read",
    "patients:write",
    "appointments:read",
    "appointments:write",
    "clinical_records:read",
    "clinical_records:author",
    "clinical_records:review",
    "clinical_records:sign",
    "services:read",
    "locations:read",
    "invoices:read",
  ]),

  // Reception: front-desk scheduling + billing-issue. NO clinical_records at
  // all (matches the RLS denial in packages/db). Can delete appointments
  // (cancel/reschedule) and issue invoices, but cannot void them.
  reception: new Set<Capability>([
    "patients:read",
    "patients:write",
    "appointments:read",
    "appointments:write",
    "appointments:delete",
    "services:read",
    "locations:read",
    "invoices:read",
    "invoices:issue",
  ]),
};

export function can(role: Role, capability: Capability): boolean {
  return PERMISSIONS[role].has(capability);
}

/* ================================================================== */
/* Role-assignment authority                                          */
/* ================================================================== */
//
// Who may assign or change WHICH role on a staff member. This is distinct from
// the capability matrix above: `users:manage` says you may manage staff at all;
// the rules here add the owner-tier protection on top. Centralised so the staff
// UI (the role <select>) and the server action enforce one definition, not
// three inline copies of `role === "owner"`.

/**
 * Roles `actorRole` may assign as a staff member's role. Only an owner may
 * grant `owner` (anti-escalation); any other `users:manage` holder may assign
 * any non-owner role. Returns [] for roles without `users:manage`. Drives the
 * role <select> options in the staff UI.
 */
export function assignableRoles(actorRole: Role): Role[] {
  if (!can(actorRole, "users:manage")) return [];
  return actorRole === "owner" ? [...ROLES] : ROLES.filter((r) => r !== "owner");
}

/**
 * Whether `actorRole` may reassign a staff member FROM `fromRole` TO `toRole`.
 * Owner-tier protected on BOTH sides: only an owner may grant the owner role or
 * change a user who currently holds it. Requires `users:manage`. `fromRole` is
 * null for a user with no role yet. The server gate for role reassignment.
 */
export function canReassignRole(
  actorRole: Role,
  fromRole: Role | null,
  toRole: Role,
): boolean {
  if (!can(actorRole, "users:manage")) return false;
  if (toRole === "owner" || fromRole === "owner") return actorRole === "owner";
  return true;
}
