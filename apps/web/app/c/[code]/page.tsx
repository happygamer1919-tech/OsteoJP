import type { Metadata } from "next";
import { getStrings, DEFAULT_LOCALE, type Locale } from "@osteojp/i18n";
import { BrandLockup } from "@osteojp/ui";
import { loadReminderData } from "@/lib/reminders/data";
import { resolveLocale, formatDateLong, formatTime } from "@/lib/reminders/locale";
import { resolveConfirmCode } from "@/lib/reminders/confirm-code-store";
import { isWellFormedConfirmCode } from "@/lib/reminders/confirm-code";
import {
  confirmPageFeeNotice,
  rescheduleButtonEnabled,
} from "@/lib/reminders/confirm-page-gates";
import { FEE_NOTICE_SMS } from "@/lib/reminders/fee-notice";
import { confirmCodeAction } from "./actions";

// THE 24h SMS CONFIRM PAGE, reached from `Confirmar: osteojp.pt/c/XXXXXXXX`.
//
// SR-21: this is the EXISTING /r/[token] page re-branded for a code, not a
// second page on the portal. It keeps that page's shape, its shell, its counsel
// constraints and its outcome-as-query-flag pattern; what differs is how the
// holder is identified (a stored code rather than a signed token) and which two
// actions are offered.
//
// COUNSEL SECTION 7, unchanged and load-bearing:
//   OPENING A LINK PERFORMS NOTHING. This renders. The action runs only from
//   the POST below.
//   DATE, TIME AND LOCATION ONLY. No service name, no practitioner name, no
//   clinical content, ever — a page whose contents vary by service leaks by
//   omission.
//
// SR-30: unknown, expired and already-spent codes render the SAME page and
// reveal nothing about which they were.

export const dynamic = "force-dynamic"; // per-request; never cached.

export const metadata: Metadata = {
  title: "OsteoJP",
  robots: { index: false, follow: false },
};

/** Statuses a confirm link may still act on. Mirrors confirm-redeem.ts. */
const VIEWABLE_STATUSES = new Set(["scheduled", "confirmed"]);

/** Outcome flags actions.ts may hand back. Anything else is ignored. */
const OUTCOMES = new Set(["confirmed", "already_confirmed", "pedido", "generic"]);

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

function Message({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div className="space-y-2 text-center">
        <h1 className="text-h3 font-semibold text-text-primary">{title}</h1>
        <p className="text-body-sm text-text-secondary">{body}</p>
      </div>
    </Shell>
  );
}

/**
 * The generic rejection — identical for malformed, unknown, expired and
 * already-spent codes. It reuses the copy counsel approved on /r/[token] for
 * exactly this purpose rather than introducing a second wording for the same
 * meaning.
 */
function GenericPage({ locale }: { locale: Locale }) {
  const s = getStrings(locale);
  return <Message title={s["reschedule.invalidTitle"]} body={s["reschedule.invalidBody"]} />;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="font-medium text-text-primary">{value}</dd>
    </div>
  );
}

export default async function ConfirmCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ r?: string }>;
}) {
  const { code } = await params;
  const { r } = await searchParams;
  // One clock read for the whole render, named like every other page in this
  // app (agenda, dashboard, patients). Reading it inline in the condition is
  // an impure call during render and the compiler lint refuses it.
  const readAt = new Date();

  // A RENDER RESOLVES AND NEVER CONSUMES. Reaching this page spends nothing:
  // `resolveConfirmCode` reads, and only the POST writes. A mail or SMS
  // scanner following the link therefore cannot spend the patient's action.
  const resolved = isWellFormedConfirmCode(code)
    ? await resolveConfirmCode({ code }).catch(() => null)
    : null;
  const data = resolved
    ? await loadReminderData(resolved.tenantId, resolved.appointmentId)
    : null;

  const locale = data ? resolveLocale(data.tenantSettings) : DEFAULT_LOCALE;
  const s = getStrings(locale);

  // A finished outcome renders even when the appointment is no longer
  // actionable: somebody who has just confirmed must see that it worked.
  if (r && OUTCOMES.has(r)) {
    if (r === "confirmed")
      return <Message title={s["confirm.confirmedTitle"]} body={s["confirm.confirmedBody"]} />;
    if (r === "already_confirmed")
      return <Message title={s["confirm.alreadyTitle"]} body={s["confirm.alreadyBody"]} />;
    if (r === "pedido")
      return <Message title={s["confirm.pedidoTitle"]} body={s["confirm.pedidoBody"]} />;
    return <GenericPage locale={locale} />;
  }

  // EVERY REFUSAL TAKES THIS ONE EXIT: malformed, unknown, consumed, a missing
  // appointment, a status that is no longer actionable, and a start time in the
  // past. One page, one wording, nothing to tell them apart.
  if (!resolved || resolved.consumedAt !== null) return <GenericPage locale={locale} />;
  if (!data) return <GenericPage locale={locale} />;
  if (!VIEWABLE_STATUSES.has(data.status)) return <GenericPage locale={locale} />;
  if (data.startsAt.getTime() <= readAt.getTime()) return <GenericPage locale={locale} />;

  const feeSlot = confirmPageFeeNotice();

  return (
    <Shell>
      <h1 className="text-center text-h3 font-semibold text-text-primary">
        {s["confirm.title"]}
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
        <DetailRow label={s["reschedule.locationLabel"]} value={data.locationName} />
      </dl>

      <form action={confirmCodeAction} className="space-y-3">
        <input type="hidden" name="code" value={code} />
        <button
          type="submit"
          name="action"
          value="confirm"
          className="w-full rounded bg-brand-teal px-4 py-3 font-medium text-text-inverse hover:bg-brand-teal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {s["confirm.confirmCta"]}
        </button>

        {/* CLOSED since INC-CONFIRM-10: the press wrote a consumed_at and one
            audit_log row and nothing that any screen renders, so a patient was
            told "Pedido recebido" and nobody was told anything. The ACTION
            reads the same gate — see actions.ts — because hiding a control
            removes nothing from anybody holding the URL. What reopening it
            requires is listed on the constant. */}
        {rescheduleButtonEnabled() ? (
          <button
            type="submit"
            name="action"
            value="pedido"
            className="w-full rounded border border-border px-4 py-3 font-medium text-text-primary hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            {s["confirm.rescheduleCta"]}
          </button>
        ) : null}
      </form>

      {/* THE FEE SLOT. It renders nothing until the copy is approved by JP and
          counsel: the registry entry is `approved: false`, and that is a second
          lock the operator's flag cannot open.

          THE TEXT IS THE SMS SENTENCE, and it is a placeholder rather than a
          decision: the sentence that moved off the SMS is the only fee copy
          that exists in this repository, and page-specific wording is part of
          what JP packet 5.2 and counsel still owe. Whoever approves it changes
          this line and the registry entry together. */}
      {feeSlot ? (
        <p className="text-center text-body-sm text-text-secondary">
          {FEE_NOTICE_SMS[locale]}
        </p>
      ) : null}
    </Shell>
  );
}
