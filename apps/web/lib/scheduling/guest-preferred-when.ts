import { decodeGuestPreferredWindow } from "@osteojp/db";
import { s } from "@/lib/i18n";

/**
 * GUEST-04 — how reception is told WHEN a guest would like to come.
 *
 * A SEPARATE MODULE FROM THE PAGE, so the rule can be tested directly. The page
 * used to render `stamp(requestedStartsAt)` — the same format the pedido queue
 * uses for a real appointment — and under Option A that is a false statement:
 * the public form shows no availability, offers no times, and collects a
 * PREFERRED DATE and a PERIOD. "20/08/2026 09:00" would tell reception that
 * somebody chose nine o'clock, in the same visual place a chosen time appears,
 * and reception would ring to confirm it.
 *
 * THE `exact` ARM IS NOT A FALLBACK AND MUST NOT BECOME ONE. `decodeGuestPreferredWindow`
 * answers with a union; a window that is not one of the two period encodings is
 * rendered as the timestamp it is, so it reads DIFFERENTLY from a preference
 * rather than being absorbed into one. PORTAL-REHYDRATE §1.3: on a path that
 * produces a claim about a clinical event, an unhandled case must be visible,
 * not benign. Nothing shipped can currently write such a row — the public form
 * always encodes a period — so this arm is for a row written by hand, by a
 * future caller, or after these boundaries move.
 */

const DATE_FMT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Lisbon",
};
const TIME_FMT: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Europe/Lisbon",
};

export function formatGuestPreferredWhen(startsAt: Date, endsAt: Date): string {
  const date = startsAt.toLocaleDateString("pt-PT", DATE_FMT);
  const window = decodeGuestPreferredWindow(startsAt, endsAt);
  if (window.kind === "period") {
    const period =
      window.period === "manha" ? s["guest.periodManha"] : s["guest.periodTarde"];
    return `${date}, ${period}`;
  }
  // Not a period. Say the time, because the time is what the row holds.
  return `${date} ${startsAt.toLocaleTimeString("pt-PT", TIME_FMT)}`;
}
