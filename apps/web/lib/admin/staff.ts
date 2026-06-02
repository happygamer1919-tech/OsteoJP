import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { assertCan, isRole, type Role } from "@osteojp/auth";
import { roles, users, type DbTx } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { provisionStaffUser } from "@/lib/auth/provision";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";
import { countActiveOwners, wouldRemoveLastOwner } from "./guards";

export type StaffMember = {
  id: string;
  email: string;
  fullName: string;
  roleSlug: Role | null;
  isActive: boolean;
};

export async function listStaff(actor: RequestContext): Promise<StaffMember[]> {
  assertCan(actor.role, "users:read");

  return runScoped(actor, (tx) =>
    tx
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        roleSlug: roles.slug,
        isActive: users.isActive,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .orderBy(asc(users.fullName))
      .then((rows) =>
        rows.map((r) => ({
          ...r,
          roleSlug: isRole(r.roleSlug) ? r.roleSlug : null,
        })),
      ),
  );
}

/**
 * Invite a staff member. Capability + owner-tier gating happens here; the actual
 * privileged user creation goes ONLY through provisionStaffUser (the single
 * sanctioned admin-privilege path), which also writes the staff.invite audit row
 * inside its insert transaction.
 *
 * Returns a one-time temporary password for the inviting admin to hand over out
 * of band. Email-based invite (set-password link) is a deliberate follow-up.
 */
export async function inviteStaff(
  actor: RequestContext,
  input: { email: string; fullName: string; roleSlug: string },
): Promise<{ userId: string; tempPassword: string }> {
  assertCan(actor.role, "users:manage");

  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!email.includes("@") || !fullName) {
    throw new AdminError("invalid", "email and full name are required");
  }
  if (!isRole(input.roleSlug)) {
    throw new AdminError("invalid", `unknown role '${input.roleSlug}'`);
  }
  // Owner-tier hardening: only an owner may create another owner (prevents an
  // admin escalating privilege). See packages/auth anti-escalation intent.
  if (input.roleSlug === "owner" && actor.role !== "owner") {
    throw new AdminError("owner_tier");
  }

  const tempPassword = randomBytes(18).toString("base64url");
  const { userId } = await provisionStaffUser(actor, {
    email,
    fullName,
    roleSlug: input.roleSlug,
    password: tempPassword,
  });
  return { userId, tempPassword };
}

export async function setStaffActive(
  actor: RequestContext,
  userId: string,
  active: boolean,
): Promise<void> {
  assertCan(actor.role, "users:manage");

  await runScoped(actor, async (tx) => {
    const target = await loadTarget(tx, userId);
    if (!target) throw new AdminError("not_found");

    // Owner-tier: only an owner may (de)activate an owner.
    if (target.roleSlug === "owner" && actor.role !== "owner") {
      throw new AdminError("owner_tier");
    }
    if (target.isActive === active) return; // no-op

    if (!active && target.roleSlug === "owner") {
      const activeOwnerCount = await countActiveOwners(tx);
      if (
        wouldRemoveLastOwner({
          activeOwnerCount,
          targetIsActiveOwner: target.isActive,
          changeRemovesOwner: true,
        })
      ) {
        throw new AdminError("last_owner");
      }
    }

    await tx.update(users).set({ isActive: active }).where(eq(users.id, userId));

    await writeAudit(tx, actor, {
      action: active ? "staff.reactivate" : "staff.deactivate",
      entityType: "user",
      entityId: userId,
    });
  });
}

export async function changeStaffRole(
  actor: RequestContext,
  userId: string,
  newRoleSlug: string,
): Promise<void> {
  assertCan(actor.role, "users:manage");

  if (!isRole(newRoleSlug)) {
    throw new AdminError("invalid", `unknown role '${newRoleSlug}'`);
  }

  await runScoped(actor, async (tx) => {
    const target = await loadTarget(tx, userId);
    if (!target) throw new AdminError("not_found");

    const current = target.roleSlug;
    if (current === newRoleSlug) return; // no-op

    // Owner-tier: only an owner may grant the owner role or modify an owner.
    if ((newRoleSlug === "owner" || current === "owner") && actor.role !== "owner") {
      throw new AdminError("owner_tier");
    }

    const newRole = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.slug, newRoleSlug));
    const newRoleId = newRole[0]?.id;
    if (!newRoleId) throw new AdminError("invalid", `role '${newRoleSlug}' not seeded in tenant`);

    const changeRemovesOwner = current === "owner" && newRoleSlug !== "owner";
    if (changeRemovesOwner) {
      const activeOwnerCount = await countActiveOwners(tx);
      if (
        wouldRemoveLastOwner({
          activeOwnerCount,
          targetIsActiveOwner: target.isActive,
          changeRemovesOwner,
        })
      ) {
        throw new AdminError("last_owner");
      }
    }

    await tx.update(users).set({ roleId: newRoleId }).where(eq(users.id, userId));

    await writeAudit(tx, actor, {
      action: "staff.role_change",
      entityType: "user",
      entityId: userId,
      metadata: { from: current ?? null, to: newRoleSlug },
    });
  });
}

/**
 * Validate + normalize a staff profile edit. Pure (no DB) so the rule is
 * unit-testable. Email is trimmed + lowercased to match the invite path and the
 * (tenant_id, email) uniqueness intent; full name is trimmed. Throws `invalid`
 * when either is empty or the email is obviously malformed.
 */
export function normalizeStaffProfile(input: {
  fullName: string;
  email: string;
}): { fullName: string; email: string } {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!email.includes("@") || !fullName) {
    throw new AdminError("invalid", "email and full name are required");
  }
  return { fullName, email };
}

const PG_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  );
}

/**
 * Edit an invited staff member's name and/or email. Capability-gated
 * (users:manage) and owner-tier hardened: only an owner may edit an owner, in
 * parity with role-change and (de)activate. Email is unique per tenant
 * (users_tenant_email_uq) — a collision surfaces as a clean `email_taken`
 * domain error rather than a raw constraint violation. RLS scopes every read
 * and write to the actor's tenant via runScoped.
 */
export async function editStaff(
  actor: RequestContext,
  userId: string,
  input: { fullName: string; email: string },
): Promise<void> {
  assertCan(actor.role, "users:manage");
  const { fullName, email } = normalizeStaffProfile(input);

  await runScoped(actor, async (tx) => {
    const target = await loadTarget(tx, userId);
    if (!target) throw new AdminError("not_found");

    // Owner-tier: only an owner may edit an owner's profile (anti-escalation).
    if (target.roleSlug === "owner" && actor.role !== "owner") {
      throw new AdminError("owner_tier");
    }

    const changed: string[] = [];
    if (target.fullName !== fullName) changed.push("full_name");
    if (target.email !== email) changed.push("email");
    if (changed.length === 0) return; // no-op

    try {
      await tx.update(users).set({ fullName, email }).where(eq(users.id, userId));
    } catch (e) {
      // Defense-in-depth against a concurrent email collision: the unique index
      // is the source of truth, so translate its violation, not a pre-check.
      if (isUniqueViolation(e)) throw new AdminError("email_taken");
      throw e;
    }

    await writeAudit(tx, actor, {
      action: "staff.profile_update",
      entityType: "user",
      entityId: userId,
      // PII-free: record WHICH fields changed, never their values (rule 7).
      metadata: { fields: changed },
    });
  });
}

type Target = {
  isActive: boolean;
  roleSlug: Role | null;
  fullName: string;
  email: string;
};

async function loadTarget(tx: DbTx, userId: string): Promise<Target | null> {
  const rows = await tx
    .select({
      isActive: users.isActive,
      roleSlug: roles.slug,
      fullName: users.fullName,
      email: users.email,
    })
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    .where(and(eq(users.id, userId)));
  const row = rows[0];
  if (!row) return null;
  return {
    isActive: row.isActive,
    roleSlug: isRole(row.roleSlug) ? row.roleSlug : null,
    fullName: row.fullName,
    email: row.email,
  };
}
