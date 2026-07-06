import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, count, eq, or } from "drizzle-orm";
import { assertCan, canReassignRole, isRole, type Role } from "@osteojp/auth";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import {
  analyticsEvents,
  appointmentNotes,
  appointments,
  auditLog,
  availabilityTemplates,
  clinicalEpisodes,
  clinicalRecords,
  roles,
  therapistServices,
  timeOff,
  users,
  type DbTx,
} from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { provisionStaffUser, generateSetPasswordLink } from "@/lib/auth/provision";
import { sendEmail, type SendResult } from "@/lib/reminders/clients";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";
import { verifyDeletePassword } from "./appointment-delete-password";
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
 * How a staff invite was delivered. `email` = a set-password link was actually
 * sent; `temp_password` = the link could not be delivered and the admin must
 * hand over the one-time password out of band.
 */
export type InviteResult =
  | { userId: string; delivery: "email" }
  | { userId: string; delivery: "temp_password"; tempPassword: string };

/**
 * Decide invite delivery from the email-send outcome. The temp password is the
 * fallback whenever the invite mail did NOT actually leave the system: a failed
 * send (caught upstream as `null`) OR a sandbox/suppressed send
 * (REMINDERS_LIVE_SEND !== "true"). Only a real, live delivery counts as
 * `email` — otherwise the new staff member would have no way to sign in. Pure
 * so the rule is unit-testable without the IO.
 */
export function inviteDeliveryFromSend(
  send: SendResult | null,
): "email" | "temp_password" {
  return send && !send.sandbox ? "email" : "temp_password";
}

/**
 * Invite a staff member. Capability + owner-tier gating happens here; the actual
 * privileged user creation goes ONLY through provisionStaffUser (the single
 * sanctioned admin-privilege path), which also writes the staff.invite audit row
 * inside its insert transaction.
 *
 * Delivery: a single-use, expiring set-password link is emailed via the shared
 * Resend path so the new member sets their own password. The one-time temporary
 * password is kept ONLY as a fallback for when the email is not delivered (send
 * error or sandbox suppression) — see inviteDeliveryFromSend.
 *
 * Idempotent: an email already belonging to a staff member in this tenant is
 * rejected with `already_invited` (no duplicate auth user created). A race with
 * a concurrent invite is caught as the (tenant_id, email) unique violation.
 */
export async function inviteStaff(
  actor: RequestContext,
  input: { email: string; fullName: string; roleSlug: string },
): Promise<InviteResult> {
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

  // Idempotent invite: a staff member with this email already exists in the
  // tenant → clean domain error, before any privileged auth-user creation.
  const existing = await runScoped(actor, (tx) =>
    tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1),
  );
  if (existing.length > 0) {
    throw new AdminError("already_invited");
  }

  const tempPassword = randomBytes(18).toString("base64url");
  let userId: string;
  try {
    ({ userId } = await provisionStaffUser(actor, {
      email,
      fullName,
      roleSlug: input.roleSlug,
      password: tempPassword,
    }));
  } catch (e) {
    // Concurrent invite won the (tenant_id, email) unique index between the
    // pre-check above and the insert — surface the same clean domain error.
    if (isUniqueViolation(e)) throw new AdminError("already_invited");
    throw e;
  }

  // Email the set-password link. Any failure (link generation or send) leaves
  // `send` null and falls through to the temp-password hand-off.
  let send: SendResult | null = null;
  try {
    const link = await generateSetPasswordLink(email);
    if (link) {
      // Staff invite copy uses the default (clinic) locale; there is no
      // per-user locale preference at invite time.
      const s = getStrings(DEFAULT_LOCALE);
      const body = `${s["admin.invite.email.intro"]}\n\n${link}\n\n${s["admin.invite.email.outro"]}`;
      send = await sendEmail({ to: email, subject: s["admin.invite.email.subject"], body });
    }
  } catch {
    send = null;
  }

  return inviteDeliveryFromSend(send) === "email"
    ? { userId, delivery: "email" }
    : { userId, delivery: "temp_password", tempPassword };
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

    // Owner-tier authority is defined once in the permission matrix (shared with
    // the staff UI's role <select>): an admin may reassign any non-owner role,
    // but granting owner or changing an owner is owner-only.
    if (!canReassignRole(actor.role, current, newRoleSlug)) {
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

/**
 * Hard-delete a staff member (W4-01, owner-requested). Password-gated (reuses
 * the tenant delete password from Administração → Definições, W3-06) + a
 * linked-records guard: REFUSED when the user has ANY appointment, clinical
 * record/episode, clinical note, audit entry, or analytics event — so an
 * established therapist is never destroyed (deactivate instead); only an
 * activity-free account (e.g. a mistyped invite) can be removed. Admin-only,
 * owner-tier protected (never an owner), never self.
 *
 * The user's own CONFIG rows (therapist_services, availability_templates,
 * time_off) are deleted child-first (RETURNING); then the users row. Clinical
 * and audit data are never touched.
 */
export async function deleteStaffMember(
  actor: RequestContext,
  userId: string,
  password: string,
): Promise<void> {
  assertCan(actor.role, "users:manage");
  if (!userId) throw new AdminError("invalid");
  if (userId === actor.userId) throw new AdminError("invalid"); // never delete yourself

  // Server-side password gate — never trust a client check.
  if (!(await verifyDeletePassword(actor, password))) {
    throw new AdminError("password");
  }

  await runScoped(actor, async (tx) => {
    const [target] = await tx
      .select({ id: users.id, roleId: users.roleId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!target) throw new AdminError("not_found");

    // Owner-tier: never delete an owner via this control.
    const [ownerRole] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.slug, "owner"))
      .limit(1);
    if (ownerRole && target.roleId === ownerRole.id) throw new AdminError("owner_tier");

    // Linked-records guard — refuse if the user has ANY activity / clinical /
    // audit reference. Only an activity-free account is deletable.
    const counts = await Promise.all([
      tx.select({ n: count() }).from(appointments).where(or(eq(appointments.practitionerId, userId), eq(appointments.createdBy, userId))),
      tx.select({ n: count() }).from(clinicalRecords).where(or(eq(clinicalRecords.practitionerId, userId), eq(clinicalRecords.signedBy, userId))),
      tx.select({ n: count() }).from(clinicalEpisodes).where(eq(clinicalEpisodes.primaryPractitionerId, userId)),
      tx.select({ n: count() }).from(appointmentNotes).where(eq(appointmentNotes.authorUserId, userId)),
      tx.select({ n: count() }).from(auditLog).where(eq(auditLog.actorUserId, userId)),
      tx.select({ n: count() }).from(analyticsEvents).where(or(eq(analyticsEvents.therapistUserId, userId), eq(analyticsEvents.actorUserId, userId))),
    ]);
    const activity = counts.reduce((sum, [row]) => sum + Number(row?.n ?? 0), 0);
    if (activity > 0) throw new AdminError("has_activity");

    // Delete the user's own config rows child-first (RETURNING), then the user.
    await tx.delete(therapistServices).where(eq(therapistServices.therapistUserId, userId)).returning({ id: therapistServices.id });
    await tx.delete(availabilityTemplates).where(eq(availabilityTemplates.userId, userId)).returning({ id: availabilityTemplates.id });
    await tx.delete(timeOff).where(eq(timeOff.userId, userId)).returning({ id: timeOff.id });

    const del = await tx.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
    if (del.length === 0) throw new AdminError("not_found");

    await writeAudit(tx, actor, {
      action: "staff.delete",
      entityType: "user",
      entityId: userId,
      metadata: { roleId: target.roleId }, // ids only — PII-free
    });
  });
}
