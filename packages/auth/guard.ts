// Enforcement glue for the permission matrix in permissions.ts.
//
// Routes / server actions call assertCan() before touching the DB. The DB
// layer (packages/db) then re-checks via RLS using the {tenant_id, user_role}
// claims pulled off the same RequestContext through toClaims() — defense in
// depth, with one canonical mapping so the two layers can't drift.
//
// Pure functions only. No framework/session/header reading here; that lives
// in the app layer and produces a RequestContext to feed into these.

import { can, type Capability, type Role } from "./permissions";

export class ForbiddenError extends Error {
  // Stable discriminator for route error handlers (instanceof breaks across
  // bundling boundaries; this doesn't).
  override readonly name = "ForbiddenError";
  readonly capability: Capability;
  readonly role: Role;

  constructor(role: Role, capability: Capability) {
    super(`role '${role}' is missing capability '${capability}'`);
    this.role = role;
    this.capability = capability;
  }
}

export function assertCan(role: Role, capability: Capability): void {
  if (!can(role, capability)) {
    throw new ForbiddenError(role, capability);
  }
}

export type RequestContext = {
  tenantId: string;
  role: Role;
  // Supabase auth user id (the verified JWT `sub`). The audit actor written on
  // every mutation (audit_log.actor_user_id). Also included as `sub` in the
  // claims so auth.uid() resolves correctly inside withTenantContext — required
  // by any RLS policy that checks staff_user_id = auth.uid() (e.g. quick_notes).
  userId: string;
};

// Maps the camelCase app-layer context to the snake_case claim shape that
// packages/db's withTenantContext / RLS policies consume. Keeping the
// mapping here means both layers reference the same field names.
export function toClaims(ctx: RequestContext): {
  tenant_id: string;
  user_role: string;
  sub: string;
} {
  return {
    tenant_id: ctx.tenantId,
    user_role: ctx.role,
    sub: ctx.userId,
  };
}
