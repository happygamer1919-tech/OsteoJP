import type { Metadata } from "next";
import { getStrings, DEFAULT_LOCALE, type Locale } from "@osteojp/i18n";
import { verifyRescheduleToken } from "@/lib/reminders/link-token";
import { loadReminderData } from "@/lib/reminders/data";
import { resolveLocale, formatDateLong, formatTime } from "@/lib/reminders/locale";

// Public, UNAUTHENTICATED reschedule landing page reached from reminder emails.
//
// The path segment is a stateless, HMAC-signed token (see link-token.ts) — the
// only thing in the URL. It resolves to one appointment, tenant-scoped via RLS
// (the tenant_id comes from inside the signed token, so no global lookup). The
// page shows minimal appointment details and a single call-to-action: contact
// the clinic by phone. Patient self-service (reschedule/cancel) is V1.1 — there
// is no form, no auth, no mutation here. Any bad/expired token renders a safe
// generic page that reveals nothing.

export const dynamic = "force-dynamic"; // tokenised, per-request; never cached.

export const metadata: Metadata = {
  title: "OsteoJP",
  // A tokenised public page must never be indexed.
  robots: { index: false, follow: false },
};

// An appointment that is cancelled/completed/no-show is no longer actionable;
// render the generic page rather than leak its (former) details.
const VIEWABLE_STATUSES = new Set(["scheduled", "confirmed"]);

function tenantPhone(settings: unknown): string {
  const s = settings as { contacts?: { phone?: unknown } } | null | undefined;
  const phone = s?.contacts?.phone;
  return typeof phone === "string" ? phone : "";
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-surface p-8 shadow-sm">
        <div className="text-center">
          <span className="text-h2 font-semibold tracking-tight">
            <span className="text-brand-teal">Osteo</span>
            <span className="text-brand-magenta">JP</span>
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}

function InvalidPage({ locale }: { locale: Locale }) {
  const s = getStrings(locale);
  return (
    <Shell>
      <div className="space-y-2 text-center">
        <h1 className="text-h3 font-semibold text-text-primary">
          {s["reschedule.invalidTitle"]}
        </h1>
        <p className="text-body-sm text-text-secondary">
          {s["reschedule.invalidBody"]}
        </p>
      </div>
    </Shell>
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

export default async function ReschedulePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const claims = verifyRescheduleToken(token);
  if (!claims) return <InvalidPage locale={DEFAULT_LOCALE} />;

  const data = await loadReminderData(claims.tenantId, claims.appointmentId);
  if (!data || !VIEWABLE_STATUSES.has(data.status)) {
    return <InvalidPage locale={DEFAULT_LOCALE} />;
  }

  const locale = resolveLocale(data.tenantSettings);
  const s = getStrings(locale);
  const phone = data.locationPhone || tenantPhone(data.tenantSettings);

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
          label={s["reschedule.clinicianLabel"]}
          value={data.practitionerName}
        />
        <DetailRow
          label={s["reschedule.locationLabel"]}
          value={data.locationName}
        />
      </dl>

      <div className="space-y-3 text-center">
        <h2 className="text-body font-medium text-text-primary">
          {s["reschedule.changeHeading"]}
        </h2>
        <p className="text-body-sm text-text-secondary">
          {s["reschedule.changeBody"]}
        </p>
        {phone ? (
          <a
            href={`tel:${phone.replace(/\s+/g, "")}`}
            className="inline-block rounded bg-brand-teal px-4 py-2 font-medium text-text-inverse hover:bg-brand-teal/90"
          >
            {s["reschedule.callCta"]}: {phone}
          </a>
        ) : null}
      </div>
    </Shell>
  );
}
