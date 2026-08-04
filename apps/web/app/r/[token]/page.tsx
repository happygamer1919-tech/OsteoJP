import type { Metadata } from "next";
import { getStrings, DEFAULT_LOCALE, type Locale } from "@osteojp/i18n";
import { BrandLockup } from "@osteojp/ui";
import { verifyRescheduleToken } from "@/lib/reminders/link-token";
import { actionsForScope, type RedeemAction } from "@/lib/reminders/redeem";
import { loadReminderData } from "@/lib/reminders/data";
import { resolveLocale, formatDateLong, formatTime } from "@/lib/reminders/locale";
import { redeemAction } from "./actions";

// Public, UNAUTHENTICATED one-action landing page reached from reminder emails.
//
// The path segment is a stateless, HMAC-signed token (link-token.ts) — the only
// thing in the URL. It resolves to one appointment, tenant-scoped via RLS (the
// tenant_id comes from inside the signed token, so no global lookup).
//
// COUNSEL SECTION 7, and every line of this file follows from it:
//
//   OPENING A LINK PERFORMS NOTHING. This page renders. The action runs only
//   from the confirmation screen's POST, in actions.ts. One tap to open, one tap
//   to confirm.
//
//   DATE, TIME AND LOCATION ONLY. No service name — several service names in
//   this clinic identify a treatment type, and a page whose contents vary by
//   service leaks by omission. NO PRACTITIONER NAME either: it was rendered here
//   until W13-01, it is not on counsel's permitted list, and where practitioners
//   specialise it carries the same treatment-type inference the service-name rule
//   exists to prevent. No clinical content, ever.
//
// A token is NOT a login and never becomes one: nothing here mints a session,
// and the outcome travels back as a query flag rather than as state.
//
// Any bad, expired, forged, unknown or already-spent token renders the SAME
// generic page and reveals nothing about which of those it was.

export const dynamic = "force-dynamic"; // tokenised, per-request; never cached.

export const metadata: Metadata = {
  title: "OsteoJP",
  // A tokenised public page must never be indexed.
  robots: { index: false, follow: false },
};

// An appointment that is cancelled/completed/no-show is no longer actionable;
// render the generic page rather than leak its (former) details.
const VIEWABLE_STATUSES = new Set(["scheduled", "confirmed"]);

/**
 * Per-action copy, keyed by LITERAL string keys rather than built by template.
 * The strings type is a closed union, so a template lookup is untypeable - and
 * that strictness is worth keeping: it means a copy key that does not exist is a
 * compile error rather than an empty heading on a patient-facing page.
 */
const COPY = {
  confirm: {
    cta: "reschedule.confirmCta",
    heading: "reschedule.confirmHeading",
    body: "reschedule.confirmBody",
    action: "reschedule.confirmAction",
  },
  cancel: {
    cta: "reschedule.cancelCta",
    heading: "reschedule.cancelHeading",
    body: "reschedule.cancelBody",
    action: "reschedule.cancelAction",
  },
} as const;

/** Outcome flags actions.ts may hand back. Anything else is ignored. */
const OUTCOMES = new Set(["confirmed", "cancelled", "cutoff", "refused"]);

function tenantPhone(settings: unknown): string {
  const s = settings as { contacts?: { phone?: unknown } } | null | undefined;
  const phone = s?.contacts?.phone;
  return typeof phone === "string" ? phone : "";
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-surface p-8 shadow-sm">
        <div className="flex justify-center">
          <BrandLockup variant="lockup" />
        </div>
        {children}
      </div>
    </main>
  );
}

function Message({
  locale,
  title,
  body,
  phone,
}: {
  locale: Locale;
  title: string;
  body: string;
  phone?: string;
}) {
  const s = getStrings(locale);
  return (
    <Shell>
      <div className="space-y-2 text-center">
        <h1 className="text-h3 font-semibold text-text-primary">{title}</h1>
        <p className="text-body-sm text-text-secondary">{body}</p>
      </div>
      {phone ? (
        <div className="text-center">
          <CallLink phone={phone} label={`${s["reschedule.callCta"]}: ${phone}`} />
        </div>
      ) : null}
    </Shell>
  );
}

function CallLink({ phone, label }: { phone: string; label: string }) {
  return (
    <a
      href={`tel:${phone.replace(/\s+/g, "")}`}
      className="inline-block rounded bg-brand-teal px-4 py-2 font-medium text-text-inverse hover:bg-brand-teal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
    >
      {label}
    </a>
  );
}

/** The generic rejection. Identical for malformed, forged, expired, unknown and
 *  already-consumed tokens — the caller must never learn which. */
function InvalidPage({ locale }: { locale: Locale }) {
  const s = getStrings(locale);
  return (
    <Message
      locale={locale}
      title={s["reschedule.invalidTitle"]}
      body={s["reschedule.invalidBody"]}
    />
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="font-medium text-text-primary">{value}</dd>
    </div>
  );
}

export default async function ActionTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ a?: string; r?: string }>;
}) {
  const { token } = await params;
  const { a, r } = await searchParams;

  // Verification only. Nothing here consumes the token or touches a write path:
  // a page render must be idempotent, or a mail-scanner following the link would
  // spend the patient's one action for them.
  const claims = verifyRescheduleToken(token);
  if (!claims) return <InvalidPage locale={DEFAULT_LOCALE} />;

  const data = await loadReminderData(claims.tenantId, claims.appointmentId);
  if (!data) return <InvalidPage locale={DEFAULT_LOCALE} />;

  const locale = resolveLocale(data.tenantSettings);
  const s = getStrings(locale);
  const phone = data.locationPhone || tenantPhone(data.tenantSettings);

  // A finished outcome is rendered even when the appointment is no longer
  // viewable — a patient who has just cancelled must see that it worked, and by
  // then the status is 'cancelled'.
  if (r && OUTCOMES.has(r)) {
    if (r === "confirmed")
      return (
        <Message
          locale={locale}
          title={s["reschedule.confirmedTitle"]}
          body={s["reschedule.confirmedBody"]}
        />
      );
    if (r === "cancelled")
      return (
        <Message
          locale={locale}
          title={s["reschedule.cancelledTitle"]}
          body={s["reschedule.cancelledBody"]}
        />
      );
    if (r === "cutoff")
      // The one refusal that is NOT generic, and deliberately so: it happens on
      // a token already proved valid, so naming it discloses nothing the holder
      // did not hold — and counsel section 5 requires copy directing the patient
      // to telephone. A generic page here would strand a legitimate patient.
      return (
        <Message
          locale={locale}
          title={s["reschedule.cutoffTitle"]}
          body={s["reschedule.cutoffBody"]}
          phone={phone}
        />
      );
    return <InvalidPage locale={locale} />;
  }

  if (!VIEWABLE_STATUSES.has(data.status)) return <InvalidPage locale={locale} />;

  // The offered set comes from the SCOPE INSIDE THE SIGNATURE, never from the
  // URL. The server re-checks the cutoff at redemption regardless of what is
  // offered here, so this controls what is shown, not what is permitted.
  const offered = actionsForScope(claims.scope);
  const pending = a === "confirm" || a === "cancel" ? (a as RedeemAction) : null;

  // ---- Step 2: the confirmation screen. Still performs nothing. -------------
  if (pending && offered.includes(pending)) {
    return (
      <Shell>
        <div className="space-y-2 text-center">
          <h1 className="text-h3 font-semibold text-text-primary">
            {s[COPY[pending].heading]}
          </h1>
          <p className="text-body-sm text-text-secondary">
            {s[COPY[pending].body]}
          </p>
        </div>

        <dl className="space-y-3 rounded-md border border-border bg-bg p-4 text-body-sm">
          <DetailRow
            label={s["reschedule.dateLabel"]}
            value={formatDateLong(data.startsAt, locale)}
          />
          <DetailRow
            label={s["reschedule.timeLabel"]}
            value={formatTime(data.startsAt, locale)}
          />
          <DetailRow
            label={s["reschedule.locationLabel"]}
            value={data.locationName}
          />
        </dl>

        <form action={redeemAction} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="action" value={pending} />
          <button
            type="submit"
            className="w-full rounded bg-brand-teal px-4 py-3 font-medium text-text-inverse hover:bg-brand-teal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            {s[COPY[pending].action]}
          </button>
        </form>

        <div className="text-center">
          <a
            href={`/r/${encodeURIComponent(token)}`}
            className="text-body-sm text-text-secondary underline"
          >
            {s["reschedule.backCta"]}
          </a>
        </div>
      </Shell>
    );
  }

  // ---- Step 1: the appointment, and what may be done with it ---------------
  return (
    <Shell>
      <h1 className="text-center text-h3 font-semibold text-text-primary">
        {s["reschedule.title"]}
      </h1>

      <dl className="space-y-3 rounded-md border border-border bg-bg p-4 text-body-sm">
        <DetailRow
          label={s["reschedule.dateLabel"]}
          value={formatDateLong(data.startsAt, locale)}
        />
        <DetailRow
          label={s["reschedule.timeLabel"]}
          value={formatTime(data.startsAt, locale)}
        />
        <DetailRow
          label={s["reschedule.locationLabel"]}
          value={data.locationName}
        />
      </dl>

      <div className="space-y-3">
        {offered.map((action) => (
          <a
            key={action}
            href={`/r/${encodeURIComponent(token)}?a=${action}`}
            className={
              action === "confirm"
                ? "block rounded bg-brand-teal px-4 py-3 text-center font-medium text-text-inverse hover:bg-brand-teal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                : "block rounded border border-border px-4 py-3 text-center font-medium text-text-primary hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            }
          >
            {s[COPY[action].cta]}
          </a>
        ))}
      </div>

      <div className="space-y-3 text-center">
        <h2 className="text-body font-medium text-text-primary">
          {s["reschedule.changeHeading"]}
        </h2>
        <p className="text-body-sm text-text-secondary">
          {s["reschedule.changeBody"]}
        </p>
        {phone ? (
          <CallLink phone={phone} label={`${s["reschedule.callCta"]}: ${phone}`} />
        ) : null}
      </div>
    </Shell>
  );
}
