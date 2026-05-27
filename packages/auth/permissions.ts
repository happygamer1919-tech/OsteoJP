// Role → capability matrix for OsteoJP.
//
// This file is the app-layer source of truth for who-can-do-what *within* a
// tenant. The tenant wall and the clinical-records gate (owner/admin/therapist
// may touch clinical_records, reception may not) are also enforced by Postgres
// RLS in packages/db — that is defense in depth. All other intra-tenant role
// rules live here and are enforced by server actions / API routes before any
// DB call.

export type Role = "owner" | "admin" | "therapist" | "reception";

export type Capability =
  | "patients:read"
  | "patients:write"
  | "patients:delete"
  | "appointments:read"
  | "appointments:write"
  | "appointments:delete"
  | "services:read"
  | "services:write"
  | "locations:read"
  | "locations:write"
  | "clinical_records:read"
  | "clinical_records:author"
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
  | "audit_log:read";

const ALL_CAPABILITIES: readonly Capability[] = [
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
  "clinical_records:author",
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
];

export const PERMISSIONS: Record<Role, ReadonlySet<Capability>> = {
  // Owner: unrestricted within their tenant. Only role that can manage other
  // roles — prevents privilege escalation by a compromised admin.
  owner: new Set<Capability>(ALL_CAPABILITIES),

  // Admin: full operational control, but does NOT author/sign clinical
  // records (oversight role, not clinician) and CANNOT manage roles.
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
  // authoring + signing. Read-only on services/locations/invoices. No
  // settings, no user/role admin, no destructive actions.
  therapist: new Set<Capability>([
    "patients:read",
    "patients:write",
    "appointments:read",
    "appointments:write",
    "clinical_records:read",
    "clinical_records:author",
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
