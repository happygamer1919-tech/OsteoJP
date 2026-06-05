// @osteojp/auth — Permission matrix (permissions.ts), RLS helpers, JWT/role utilities (tenant_id + role).
export const PACKAGE_NAME = "@osteojp/auth" as const;

export {
  PERMISSIONS,
  ROLES,
  can,
  isRole,
  parseRole,
  assignableRoles,
  canReassignRole,
} from "./permissions";
export type { Role, Capability } from "./permissions";

export { ForbiddenError, assertCan, toClaims } from "./guard";
export type { RequestContext } from "./guard";

// Patient principal — separate trust domain from the staff matrix above.
export {
  PATIENT_ROLE_CLAIM,
  parsePatientPrincipal,
  isPatientPrincipal,
  toPatientClaims,
} from "./patient";
export type { PatientPrincipal } from "./patient";
