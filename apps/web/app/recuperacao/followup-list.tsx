"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { s } from "@/lib/i18n";
import { postponeFollowup } from "@/lib/followup/actions";
import { whatsappLink, smsLink, mailtoLink, followupMessage } from "./deep-links";
import { POSTPONE_WEEKS } from "@/lib/followup/postpone-weeks";

/**
 * RB-01 — the recuperacao list.
 *
 * A CLIENT COMPONENT, and only because the deep links must be opened by a real
 * user gesture on the receptionist's own device. Everything else here is a
 * server action.
 *
 * ==========================================================================
 * WHAT THE TICK MEANS, and it is on the screen as well as in this comment
 * ==========================================================================
 * "Contactado por X em Y" records that somebody PRESSED THE LINK on this
 * machine. It does not say the message was written, sent, delivered or read:
 * once WhatsApp or the mail client opens, this system has no visibility and
 * deliberately wants none.
 *
 * The label therefore never says "enviado", and `followup.contactNote` says the
 * distinction in plain Portuguese under the list. A tick is the most over-read
 * symbol available on a screen like this, and a receptionist who believes it
 * means "sent" will not ring the patient who never got the message.
 */

/** The channels 0067's CHECK admits. A UNION, not `string`, so channelLabel
 *  below can be exhaustive for real rather than in a comment. */
export type FollowupChannel = "whatsapp" | "sms" | "email";

export type FollowupRow = {
  patientId: string;
  fullName: string;
  phone: string | null;
  /** E.164, or null when the stored number cannot be normalised. */
  phoneE164: string | null;
  /** False for a Portuguese geographic line: it cannot receive SMS or WhatsApp. */
  smsCapable: boolean;
  email: string | null;
  /** Preformatted in Europe/Lisbon by the server. */
  lastAttendance: string;
  practitionerName: string | null;
  contacts: { channel: FollowupChannel; when: string; who: string | null }[];
};

// One definition, in a plain module both sides import (INC-13). The screen
// can no longer offer a length the server rejects.
const POSTPONE_CHOICES = POSTPONE_WEEKS;

export function FollowupList({ rows }: { rows: FollowupRow[] }) {
  if (rows.length === 0) {
    /**
     * RENDERED, NOT HIDDEN. A block that disappears when the list is empty
     * makes "nobody needs calling" and "this list failed to load" the same
     * screen — INC-05's shape, and the reason every empty state on this
     * platform says what empty MEANS rather than showing nothing.
     */
    return (
      <div className="rounded-v2 border border-v2-border bg-surface-muted p-8 text-center">
        <p className="text-sm font-medium text-v2-text-primary">{s["followup.empty"]}</p>
        <p className="mt-1 text-sm text-v2-text-secondary">{s["followup.emptyHint"]}</p>
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <FollowupCard key={r.patientId} row={r} />
        ))}
      </ul>
      <p className="mt-3 text-xs text-v2-text-secondary">{s["followup.contactNote"]}</p>
    </>
  );
}

function FollowupCard({ row }: { row: FollowupRow }) {
  const [pending, start] = useTransition();
  const [showPostpone, setShowPostpone] = useState(false);
  /** null = nothing to report. Never a boolean: "the write failed" and "your
   *  session ended" need different instructions from the receptionist. */
  const [failed, setFailed] = useState<"failed" | "session" | null>(null);
  const router = useRouter();

  const message = followupMessage(
    s["followup.messageTemplate"],
    row.fullName,
    row.lastAttendance,
  );

  /**
   * ==========================================================================
   * THE MARK, AND THE TWO THINGS THE PREVIOUS VERSION GOT WRONG.
   * ==========================================================================
   * Observed by the owner on 2026-08-28: pressing WhatsApp opened WhatsApp and
   * no "Contactado por … em …" line ever appeared, after a genuine reload.
   *
   * WRONG 1 — THE WRITE WAS NOT GUARANTEED TO SURVIVE THE CLICK. This handler
   * runs on a click that ALSO navigates: `wa.me` into a new window, `sms:` and
   * `mailto:` handed to an external application. The old version called a
   * Server Action inside `startTransition`, which is dispatched by React's own
   * transport and has no way to say "this request must outlive the document".
   * The browser began the handoff in the same tick and whether the POST
   * survived was left to chance.
   *
   *   `fetch(..., { keepalive: true })` IS SPECIFIED TO OUTLIVE ITS DOCUMENT.
   *   That is the entire reason the transport changed. The RULE did not:
   *   `recordFollowupContactFor` is still the one definition of this write and
   *   the route handler is one of its callers.
   *
   * WRONG 2 — THE FAILURE WAS SWALLOWED. The old `catch {}` carried a reason
   * that reads well and is false in the case that mattered: "there is nothing
   * useful to tell the user". There is. **A mark that was never recorded is
   * indistinguishable on screen from a patient nobody has contacted**, so the
   * next receptionist rings somebody who was rung an hour ago, or does not ring
   * somebody who was missed. That is a new failure case wearing the face of a
   * harmless known one.
   *
   * WHAT IS UNCHANGED, AND MUST STAY UNCHANGED. The link is still an ordinary
   * anchor with a real `href`: middle click, long press and a JavaScript
   * failure all still reach WhatsApp. The navigation is still NOT blocked on
   * the write — a failed audit row must never cost the patient their phone
   * call. The request is merely ISSUED before the browser leaves, instead of
   * being scheduled and hoped for.
   */
  const mark = (channel: FollowupChannel) => {
    setFailed(null);
    /**
     * NOT INSIDE `startTransition`. A transition SCHEDULES work; this needs the
     * request on the wire before the click's default action proceeds, and
     * `fetch` starts it synchronously. `pending` still guards the postpone
     * controls, which are a different, non-navigating interaction.
     */
    void fetch("/api/followup/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patientId: row.patientId, channel }),
      keepalive: true,
      // The mark is per-session staff activity; a cached response would be a
      // second mark that never happened.
      cache: "no-store",
    })
      .then((res) => {
        if (res.ok) {
          // The row re-renders from the server, so the line the receptionist
          // sees is the row that is in the database - never optimistic local
          // state, which would show a mark for a write that failed.
          router.refresh();
          return;
        }
        /**
         * A 401 IS THE ONE WORTH NAMING SEPARATELY. It means the session
         * expired while the page was open, and the fix is to sign in again -
         * which is a different instruction from "try again".
         */
        setFailed(res.status === 401 ? "session" : "failed");
      })
      .catch(() => {
        // A network-level failure. The page may be unloading, in which case
        // `keepalive` still delivers the request and this state is never seen.
        setFailed("failed");
      });
  };

  const canMessagePhone = row.phoneE164 !== null && row.smsCapable;

  return (
    <li className="rounded-v2 border border-v2-border bg-surface-base p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-v2-text-primary">{row.fullName}</span>
        <Link
          href={`/patients/${row.patientId}`}
          className="text-xs font-medium text-v2-accent underline"
        >
          {s["followup.openPatient"]}
        </Link>
      </div>

      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-v2-text-secondary">
        <div className="flex gap-1">
          <dt>{s["followup.lastAttendance"]}:</dt>
          <dd className="font-medium text-v2-text-primary">{row.lastAttendance}</dd>
        </div>
        {row.practitionerName ? (
          <div className="flex gap-1">
            <dt>{s["followup.practitioner"]}:</dt>
            <dd className="font-medium text-v2-text-primary">{row.practitionerName}</dd>
          </div>
        ) : null}
        <div className="flex gap-1">
          {/* The number AS STORED. Reception reads it out to a person, and
              "+351912345678" is not how anybody says a telephone number. */}
          <dd>{row.phone ?? s["followup.noPhone"]}</dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        {canMessagePhone ? (
          <>
            <a
              href={whatsappLink(row.phoneE164!, message)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => mark("whatsapp")}
              className="rounded-v2 border border-v2-border px-3 py-1.5 text-xs font-semibold"
            >
              {s["followup.whatsapp"]}
            </a>
            <a
              href={smsLink(row.phoneE164!, message)}
              onClick={() => mark("sms")}
              className="rounded-v2 border border-v2-border px-3 py-1.5 text-xs font-semibold"
            >
              {s["followup.sms"]}
            </a>
          </>
        ) : null}
        {row.email ? (
          <a
            href={mailtoLink(row.email, s["followup.messageSubject"], message)}
            onClick={() => mark("email")}
            className="rounded-v2 border border-v2-border px-3 py-1.5 text-xs font-semibold"
          >
            {s["followup.email"]}
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => setShowPostpone((v) => !v)}
          disabled={pending}
          className="rounded-v2 border border-v2-border px-3 py-1.5 text-xs font-semibold"
        >
          {s["followup.postpone"]}
        </button>
      </div>

      {/* ==================================================================
          THE ABSENCE IS NAMED, BUT ONLY WHERE THE FIELD CANNOT NAME IT ITSELF.
          ==================================================================
          This used to render `followup.noPhone` for EVERY row that cannot be
          messaged, which is two different rows:

            - NO PHONE AT ALL. The field above already reads "Sem número
              registado" - it is the field's own value - so a second copy under
              the buttons said the same thing twice. That is the duplication the
              owner saw on his screen.

            - A LANDLINE. The field above shows the REAL NUMBER, and this line
              said "Sem número registado" underneath it. Not redundant: FALSE.
              There is a number; it cannot receive these two channels.

          So the field keeps the empty case, because that IS the field, and this
          line now carries only the case the field cannot express - a good
          number that this screen cannot use, which is the one that tells
          reception to ask for a telemóvel. Same distinction
          LE-reminders-landline-dispatch drew between "invalid" and "cannot
          receive THIS channel".

          MY OWN E2E ASSERTED THE WRONG STRING ON THE LANDLINE ROW AND PASSED,
          because the text was present - for the wrong reason. Criterion F on
          ACC-vacuous-guard-sweep, in a spec I wrote two days ago. */}
      {row.phoneE164 !== null && !row.smsCapable ? (
        <p className="mt-2 text-xs text-v2-text-secondary">
          {s["followup.phoneCannotReceive"]}
        </p>
      ) : null}
      {!row.email ? (
        <p className="mt-1 text-xs text-v2-text-secondary">{s["followup.noEmail"]}</p>
      ) : null}

      {showPostpone ? (
        <div className="mt-3 rounded-v2 border border-v2-border bg-surface-muted p-3">
          <p className="text-xs text-v2-text-secondary">{s["followup.postponeHint"]}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {POSTPONE_CHOICES.map((w) => (
              <button
                key={w}
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await postponeFollowup(row.patientId, w);
                  })
                }
                className="rounded-v2 border border-v2-border px-3 py-1.5 text-xs font-semibold"
              >
                {s["followup.postponeWeeks"].replace("{n}", String(w))}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* ==================================================================
          A FAILED MARK IS LOUD, AND IT IS LOUD *HERE*.
          ==================================================================
          It renders on the row it belongs to, immediately above the contact
          history, because that is the exact place a receptionist looks to
          answer "has anybody rung this person". An absent mark and a failed
          mark look identical there unless one of them says so.

          `role="alert"` so it is announced rather than only drawn: the
          receptionist's attention is on the WhatsApp window that just opened,
          not on this tab. */}
      {failed ? (
        <p role="alert" className="mt-3 text-xs font-medium text-error">
          {failed === "session" ? s["followup.contactFailedSession"] : s["followup.contactFailed"]}
        </p>
      ) : null}

      {row.contacts.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-0.5">
          {row.contacts.map((c, i) => (
            <li key={i} className="text-xs text-v2-text-secondary">
              <span className="font-medium">{channelLabel(c.channel)}</span>{" "}
              {c.who
                ? s["followup.contactedBy"].replace("{who}", c.who).replace("{when}", c.when)
                : s["followup.contactedUnknown"].replace("{when}", c.when)}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * EXHAUSTIVE OVER THE CHANNEL SET, WITH NO STRING FALLBACK.
 *
 * INC-09 is the reason this is a switch and not `LABEL[c] ?? c`. That fallback
 * rendered a raw database enum, in English, on a pt-PT reception screen for
 * days, because a migration widened the set and nothing here was updated. The
 * channels are pinned by a CHECK in 0067; if one is ever added, this fails to
 * compile instead of printing it.
 */
function channelLabel(channel: FollowupChannel): string {
  switch (channel) {
    case "whatsapp":
      return s["followup.whatsapp"];
    case "sms":
      return s["followup.sms"];
    case "email":
      return s["followup.email"];
    default: {
      // The exhaustiveness is REAL, not a comment: `never` means adding a
      // channel to the union without a case here is a TYPE ERROR. A
      // `return channel` here would compile forever and print the raw value.
      const unreachable: never = channel;
      throw new Error(`unknown follow-up channel: ${String(unreachable)}`);
    }
  }
}
