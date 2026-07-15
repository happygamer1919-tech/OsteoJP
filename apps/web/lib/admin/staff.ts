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
import { provisionStaffUser, generateSetPasswordLink, updateStaffAuthEmail } from "@/lib/auth/provision";
import { invitesLiveSendEnabled, sendInviteEmail } from "@/lib/invites/email";
import { type SendResult } from "@/lib/reminders/clients";
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
  // W8-02: staff contact phone + professional job title (both nullable, admin-
  // managed, ship empty). jobTitle is a DISPLAY field, orthogonal to roleSlug.
  phone: string | null;
  jobTitle: string | null;
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
        phone: users.phone,
        jobTitle: users.jobTitle,
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
 * (INVITES_LIVE_SEND !== "true"). Only a real, live delivery counts as
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
 * Delivery: when INVITES_LIVE_SEND is on, a single-use, expiring set-password
 * link is emailed via Resend so the new member sets their own password. The
 * one-time temporary password is the fallback for every other outcome (gate
 * off, key absent, send error) — see inviteDeliveryFromSend.
 *
 * Idempotent: an email already belonging to a staff member in this tenant is
 * rejected with `already_invited` (no duplicate auth user created). A race with
 * a concurrent invite is caught as the (tenant_id, email) unique violation.
 *
 * W7-01: every failure path throws a typed AdminError, so the caller can render
 * a specific pt-PT message. Nothing here may leak a raw Error — inviteAction
 * masks those as the generic "A operação falhou" AND drops the temporary
 * password, which is the exact regression this loop fixed.
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

  // Email the set-password link, but only when the invite gate is on. Any
  // failure (link generation or send) leaves `send` null and falls through to
  // the temp-password hand-off — the invite itself never fails because of the
  // email. With the gate off we skip the privileged link call entirely: the
  // temp password is the delivery, so a set-password link would be dead weight.
  let send: SendResult | null = null;
  if (invitesLiveSendEnabled()) {
    try {
      const link = await generateSetPasswordLink(email);
      if (link) {
        // Staff invite copy uses the default (clinic) locale; there is no
        // per-user locale preference at invite time.
        const s = getStrings(DEFAULT_LOCALE);
        const body = `${s["admin.invite.email.intro"]}\n\n${link}\n\n${s["admin.invite.email.outro"]}`;
        send = await sendInviteEmail({ to: email, subject: s["admin.invite.email.subject"], body });
      }
    } catch {
      send = null;
    }
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
 * Trim an optional free-text field to its stored form: an empty/whitespace-only
 * value normalizes to NULL (the column is nullable and ships empty), otherwise
 * the trimmed string. Pure so the rule is unit-testable. Used for the W8-02
 * phone + job-title fields, which are optional and admin-entered by hand.
 */
export function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Validate + normalize a staff profile edit. Pure (no DB) so the rule is
 * unit-testable. Email is trimmed + lowercased to match the invite path and the
 * (tenant_id, email) uniqueness intent; full name is trimmed. Throws `invalid`
 * when either is empty or the email is obviously malformed. W8-02: phone +
 * jobTitle are optional — each normalizes to NULL when blank (never validated
 * as required); phone is PII and is never logged by the caller.
 */
export function normalizeStaffProfile(input: {
  fullName: string;
  email: string;
  phone?: string | null;
  jobTitle?: string | null;
}): { fullName: string; email: string; phone: string | null; jobTitle: string | null } {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!email.includes("@") || !fullName) {
    throw new AdminError("invalid", "email and full name are required");
  }
  return {
    fullName,
    email,
    phone: normalizeOptionalText(input.phone),
    jobTitle: normalizeOptionalText(input.jobTitle),
  };
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
 * Mask an email for the audit trail: keep the first 2 chars of the local part,
 * star out the rest, keep the domain intact. "bernardo@osteojp.pt" ->
 * "be******@osteojp.pt". Used so an email change is auditable without writing the
 * full address into audit_log (rule 7 — sanitize before persisting). Pure +
 * exported for unit testing.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***"; // not an email shape — never echo it back verbatim
  const local = email.slice(0, at);
  const domain = email.slice(at); // includes the leading "@"
  const keep = local.slice(0, 2);
  return keep + "*".repeat(Math.max(1, local.length - keep.length)) + domain;
}

/**
 * Edit an invited staff member's name and/or email. Capability-gated
 * (users:manage) and owner-tier hardened: only an owner may edit an owner, in
 * parity with role-change and (de)activate. Email is unique per tenant
 * (users_tenant_email_uq) — a collision surfaces as a clean `email_taken`
 * domain error rather than a raw constraint violation. RLS scopes every read
 * and write to the actor's tenant via runScoped.
 *
 * Email edits are synced end-to-end: an email change updates BOTH public.users
 * and the Supabase auth login email (via updateStaffAuthEmail), so a staff
 * account created with a placeholder email can later be corrected without
 * stranding the auth login on the stale address. The two writes are kept
 * consistent by ordering (see below), since the auth API is external and cannot
 * enlist in the DB transaction.
 */
export async function editStaff(
  actor: RequestContext,
  userId: string,
  input: { fullName: string; email: string; phone?: string | null; jobTitle?: string | null },
): Promise<void> {
  assertCan(actor.role, "users:manage");
  const { fullName, email, phone, jobTitle } = normalizeStaffProfile(input);

  await runScoped(actor, async (tx) => {
    const target = await loadTarget(tx, userId);
    if (!target) throw new AdminError("not_found");

    // Owner-tier: only an owner may edit an owner's profile (anti-escalation).
    if (target.roleSlug === "owner" && actor.role !== "owner") {
      throw new AdminError("owner_tier");
    }

    const emailChanged = target.email !== email;
    const changed: string[] = [];
    if (target.fullName !== fullName) changed.push("full_name");
    if (emailChanged) changed.push("email");
    // W8-02: phone + job_title are additional editable profile fields. job_title
    // is a display title, decoupled from the permission role — this write NEVER
    // touches role_id, so a job-title change cannot alter capabilities.
    if (target.phone !== phone) changed.push("phone");
    if (target.jobTitle !== jobTitle) changed.push("job_title");
    if (changed.length === 0) return; // no-op

    // (1) Write public.users first, INSIDE the RLS transaction. A
    // (tenant_id, email) collision is caught HERE as email_taken — before we
    // touch Supabase auth — so a rejected edit never desyncs the two stores.
    try {
      await tx.update(users).set({ fullName, email, phone, jobTitle }).where(eq(users.id, userId));
    } catch (e) {
      // Defense-in-depth against a concurrent email collision: the unique index
      // is the source of truth, so translate its violation, not a pre-check.
      if (isUniqueViolation(e)) throw new AdminError("email_taken");
      throw e;
    }

    // (2) Only when the email actually changed, sync the Supabase auth login
    // email. This runs while the public.users write above is still UNCOMMITTED:
    // if the auth update throws, the surrounding transaction rolls back and BOTH
    // stores stay on the old email (consistent). A name-only edit skips this
    // entirely and never touches auth.
    if (emailChanged) {
      await updateStaffAuthEmail(userId, email);
    }

    await writeAudit(tx, actor, {
      action: "staff.profile_update",
      entityType: "user",
      entityId: userId,
      // Record WHICH fields changed; for an email change also record old/new
      // MASKED (never the full address) so the trail is useful without PII.
      metadata: emailChanged
        ? { fields: changed, emailFrom: maskEmail(target.email), emailTo: maskEmail(email) }
        : { fields: changed },
    });
  });
}

type Target = {
  isActive: boolean;
  roleSlug: Role | null;
  fullName: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
};

async function loadTarget(tx: DbTx, userId: string): Promise<Target | null> {
  const rows = await tx
    .select({
      isActive: users.isActive,
      roleSlug: roles.slug,
      fullName: users.fullName,
      email: users.email,
      phone: users.phone,
      jobTitle: users.jobTitle,
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
    phone: row.phone,
    jobTitle: row.jobTitle,
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
