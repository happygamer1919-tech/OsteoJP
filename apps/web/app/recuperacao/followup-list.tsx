"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { s } from "@/lib/i18n";
import { recordFollowupContact, postponeFollowup } from "@/lib/followup/actions";
import { whatsappLink, smsLink, mailtoLink, followupMessage } from "./deep-links";

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

const POSTPONE_CHOICES = [2, 4, 8, 12] as const;

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

  const message = followupMessage(
    s["followup.messageTemplate"],
    row.fullName,
    row.lastAttendance,
  );

  /**
   * THE RECORD IS FIRE-AND-FORGET AND THE NAVIGATION IS NOT BLOCKED ON IT.
   * The link is an ordinary anchor with a real `href`, so it works with a
   * middle click, a long press and with JavaScript broken; the click handler
   * only adds the marker. If the marker write fails the receptionist still
   * reaches WhatsApp, which is the outcome that matters — a failed audit row
   * must never cost the patient their phone call.
   */
  const mark = (channel: FollowupChannel) => {
    start(async () => {
      try {
        await recordFollowupContact(row.patientId, channel);
      } catch {
        // Swallowed on purpose, and this is the one place on this feature where
        // that is right: the contact has already happened in another app. There
        // is nothing to retry and nothing useful to tell the user.
      }
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

      {/* WHY BOTH ABSENCES ARE NAMED rather than the buttons simply not being
          there. "No WhatsApp button" and "this patient cannot be reached that
          way" are different facts, and only the second tells reception to ask
          for a mobile next time they speak. */}
      {!canMessagePhone ? (
        <p className="mt-2 text-xs text-v2-text-secondary">{s["followup.noPhone"]}</p>
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
