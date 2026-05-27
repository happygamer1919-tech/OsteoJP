// @osteojp/auth — Permission matrix (permissions.ts), RLS helpers, JWT/role utilities (tenant_id + role).
export const PACKAGE_NAME = "@osteojp/auth" as const;

export { PERMISSIONS, ROLES, can, isRole, parseRole } from "./permissions.js";
export type { Role, Capability } from "./permissions.js";
