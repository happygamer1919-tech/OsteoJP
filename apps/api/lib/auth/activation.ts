import "server-only";
import { eq, and, isNull } from "drizzle-orm";
import { getStrings, DEFAULT_LOCALE, type Locale } from "@osteojp/i18n";
import { getDbAdmin, patients } from "@osteojp/db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail, sendSms, type SendResult } from "@/lib/notify/clients";

// Patient activation — a single-use, expiring link to set the first password,
// MIRRORING the staff recovery-link pattern (apps/web lib/auth/provision.ts),
// with a PLUGGABLE delivery channel (SMS is the owner-chosen default).
//
// What it does NOT do: it never hits Twilio when REMINDERS_LIVE_SEND !== "true".
// The mechanism is fully built; the actual send sits behind the existing channel
// config (lib/notify/clients.ts), so this ships without Twilio being live.
//
// Single-use + expiry are enforced by Supabase Auth (recovery OTP), exactly like
// staff — we never mint or store the token ourselves. The recovery link is
// email-based; it can be DELIVERED over SMS (the URL is channel-agnostic) or
// email. A patient therefore needs an email on file to create the auth principal;
// phone-only activation (phone-OTP) is a Wave B follow-up.

export type ActivationChannel = "sms" | "email";

export class ActivationError extends Error {
  constructor(readonly code: "missing_email" | "missing_phone" | "already_linked" | "not_found") {
    super(code);
    this.name = "ActivationError";
  }
}

/** The subset of a patient row activation needs. Resolved by the caller. */
export type PatientForActivation = {
  id: string;
  tenantId: string;
  email: string | null;
  phone: string | null;
  /** Set once the patient is linked to an auth user; null = not yet provisioned. */
  authUserId: string | null;
};

/**
 * Resolve the delivery channel from config. SMS is the owner-chosen default;
 * PATIENT_ACTIVATION_CHANNEL=email overrides. Anything else falls back to SMS.
 * Pure (reads env at call time).
 */
export function resolveActivationChannel(): ActivationChannel {
  return process.env.PATIENT_ACTIVATION_CHANNEL?.trim().toLowerCase() === "email"
    ? "email"
    : "sms";
}

/** Build the activation message body (link appended). Pure + locale-aware. */
export function buildActivationMessage(locale: Locale, link: string): string {
  const s = getStrings(locale);
  return `${s["patientActivation.smsBody"]}\n\n${link}`;
}

/**
 * Create the Supabase auth user for a patient and link it to the patients row
 * (patients.auth_user_id). Service-role + getDbAdmin with an EXPLICIT tenant_id
 * in the WHERE (the sanctioned background-job path). Idempotency: the update only
 * fires when auth_user_id IS NULL; if it matches 0 rows the patient is already
 * linked (or gone), and we roll the just-created auth user back.
 */
export async function provisionPatientAuthUser(p: {
  patientId: string;
  tenantId: string;
  email: string;
}): Promise<{ userId: string }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: p.email,
    // Random throwaway; the patient sets their real password via the link.
    password: crypto.randomUUID() + crypto.randomUUID(),
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`provisionPatientAuthUser: auth user creation failed: ${error?.message ?? "unknown"}`);
  }
  const userId = data.user.id;

  try {
    const linked = await getDbAdmin()
      .update(patients)
      .set({ authUserId: userId })
      .where(
        and(
          eq(patients.id, p.patientId),
          eq(patients.tenantId, p.tenantId),
          isNull(patients.authUserId),
        ),
      )
      .returning({ id: patients.id });

    if (linked.length === 0) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      throw new ActivationError("already_linked");
    }
  } catch (e) {
    if (!(e instanceof ActivationError)) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
    }
    throw e;
  }

  return { userId };
}

/**
 * Generate a single-use, expiring set-password link via Supabase's recovery flow.
 * Returns null (never throws) on failure so the caller can report not-delivered.
 * Mirrors generateSetPasswordLink in the staff path.
 */
export async function generatePatientActivationLink(email: string): Promise<string | null> {
  try {
    const admin = createSupabaseAdminClient();
    const redirectTo = process.env.PATIENT_ACTIVATION_REDIRECT_URL;
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      ...(redirectTo ? { options: { redirectTo } } : {}),
    });
    if (error || !data?.properties?.action_link) return null;
    return data.properties.action_link;
  } catch {
    return null;
  }
}

export type ActivationResult = {
  channel: ActivationChannel;
  /** sent = live delivery; sandbox = suppressed (send config off); not_delivered
   * = link could not be generated. */
  delivery: "sent" | "sandbox" | "not_delivered";
};

/** Injectable IO seam so the orchestration is unit-testable without Supabase. */
export type ActivationDeps = {
  provisionAuthUser: typeof provisionPatientAuthUser;
  generateLink: typeof generatePatientActivationLink;
  deliver: (a: { channel: ActivationChannel; to: string; body: string }) => Promise<SendResult>;
};

const defaultDeps: ActivationDeps = {
  provisionAuthUser: provisionPatientAuthUser,
  generateLink: generatePatientActivationLink,
  deliver: ({ channel, to, body }) =>
    channel === "sms"
      ? sendSms({ to, body })
      : sendEmail({
          to,
          subject: getStrings(DEFAULT_LOCALE)["patientActivation.emailSubject"],
          body,
        }),
};

/**
 * Send (or re-send) a patient activation link. Orchestrates: ensure the auth
 * principal exists (provision if needed), generate the single-use link, and
 * deliver it over the configured channel. Delivery is config-gated — a sandbox
 * result means the link was generated but no message left the system.
 *
 * `patient` MUST be resolved by the caller from trusted data (DB), never from
 * untrusted payload — this function does not look the patient up.
 */
export async function sendPatientActivation(
  patient: PatientForActivation,
  opts: { channel?: ActivationChannel; locale?: Locale; deps?: ActivationDeps } = {},
): Promise<ActivationResult> {
  const deps = opts.deps ?? defaultDeps;
  const channel = opts.channel ?? resolveActivationChannel();
  const locale = opts.locale ?? DEFAULT_LOCALE;

  // The recovery link is email-based, so an email is required to create the
  // principal regardless of delivery channel.
  if (!patient.email) throw new ActivationError("missing_email");
  if (channel === "sms" && !patient.phone) throw new ActivationError("missing_phone");

  if (!patient.authUserId) {
    await deps.provisionAuthUser({
      patientId: patient.id,
      tenantId: patient.tenantId,
      email: patient.email,
    });
  }

  const link = await deps.generateLink(patient.email);
  if (!link) return { channel, delivery: "not_delivered" };

  const to = channel === "sms" ? patient.phone! : patient.email;
  const result = await deps.deliver({ channel, to, body: buildActivationMessage(locale, link) });

  return { channel, delivery: result.sandbox ? "sandbox" : "sent" };
}
