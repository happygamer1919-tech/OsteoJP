import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { assertCan, isRole, type Role } from "@osteojp/auth";
import { roles, users, type DbTx } from "@osteojp/db";
import { runScoped, type Actor } from "@/lib/auth/context";
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

export async function listStaff(actor: Actor): Promise<StaffMember[]> {
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
  actor: Actor,
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
  actor: Actor,
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
  actor: Actor,
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

type Target = { isActive: boolean; roleSlug: Role | null };

async function loadTarget(tx: DbTx, userId: string): Promise<Target | null> {
  const rows = await tx
    .select({ isActive: users.isActive, roleSlug: roles.slug })
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    .where(and(eq(users.id, userId)));
  const row = rows[0];
  if (!row) return null;
  return { isActive: row.isActive, roleSlug: isRole(row.roleSlug) ? row.roleSlug : null };
}
