import { s } from "@/lib/i18n";

/**
 * ENCERRAMENTOS - the one sentence for each result code the page's actions
 * redirect with. Pure, so the mapping is unit-tested rather than read by eye.
 * An unknown code reads as the generic error, never as success.
 */
export function closuresBannerFor(m: string | undefined): { tone: "ok" | "warn" | "err"; text: string } | null {
  if (!m) return null;
  if (m === "ok") return { tone: "ok", text: s["closures.saved"] };
  if (m === "removed") return { tone: "ok", text: s["closures.removed"] };
  const warn = /^warn:(\d+)$/.exec(m);
  if (warn) return { tone: "warn", text: s["closures.savedWithVisits"].replace("{n}", warn[1]!) };
  switch (m) {
    case "err:hours_required":
      return { tone: "err", text: s["closures.error.hoursRequired"] };
    case "err:invalid":
      return { tone: "err", text: s["closures.error.invalid"] };
    case "err:duplicate":
      return { tone: "err", text: s["closures.error.duplicate"] };
    case "err:already_started":
      return { tone: "err", text: s["closures.error.started"] };
    case "err:unavailable":
      return { tone: "err", text: s["closures.unavailable"] };
    case "err:not_found":
      return { tone: "err", text: s["closures.error.notFound"] };
    default:
      return { tone: "err", text: s["closures.error.generic"] };
  }
}

/** "2026-12-25" -> "25/12/2026", the clinic's own date order. */
export function ptDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

/** The dates of a closure: one day, or "de A a B". */
export function closureDates(startsOn: string, endsOn: string): string {
  return startsOn === endsOn
    ? ptDate(startsOn)
    : s["closures.dateRange"].replace("{de}", ptDate(startsOn)).replace("{ate}", ptDate(endsOn));
}

/** The hours of a closure: the whole day, or "HH:MM - HH:MM". */
export function closureHours(closedFrom: string | null, closedTo: string | null): string {
  return closedFrom && closedTo
    ? `${closedFrom.slice(0, 5)} - ${closedTo.slice(0, 5)}`
    : s["closures.wholeDay"];
}
