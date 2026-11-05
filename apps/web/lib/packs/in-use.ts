import { packSessionsAvailable, packSessionsConsumed } from "@osteojp/db";

/**
 * "Packs em uso" (Fisiozero parity, owner request 2026-11-02): which pacotes
 * are running, and how many of each pacote's sessions are booked and free.
 *
 * PURE. Everything that decides a number on the page is here, so the rule, the
 * counts, the order and the search are tested without a database. The read
 * (`in-use-read.ts`) only fetches rows and hands them over.
 *
 * ==========================================================================
 * THE NUMBERS ARE THE REPO'S OWN BALANCE, NOT A NEW ONE
 * ==========================================================================
 * RESERVADAS is `packSessionsConsumed` (legacy_consumed plus every linked
 * appointment that is not cancelled, no-shows included) and LIVRES is
 * `packSessionsAvailable` (the total minus that, clamped at zero). They are the
 * same two functions the patient profile and the booking path use, so this
 * page cannot disagree with the agenda about a balance. RESERVADAS + LIVRES is
 * the pacote's session count, as on Fisiozero, except on an overdrawn pacote,
 * where RESERVADAS honestly exceeds it and LIVRES reads 0.
 *
 * ==========================================================================
 * "IN USE", STATED ONCE
 * ==========================================================================
 * A pacote is in use when it has at least one free session OR at least one
 * reserved session still in the future. So a pacote whose last session is
 * booked for next week stays on the list until that visit has passed, and a
 * pacote with every session spent in the past drops off.
 */

/** One instance as the read returns it, before any decision. */
export type PackInstanceRow = {
  instanceId: string;
  patientId: string;
  patientName: string;
  packName: string;
  /** The pacote's catalogue price: the TOTAL for all its sessions, in cents. */
  packPriceCents: number;
  sessionsTotal: number;
  legacyConsumed: number;
  purchasedAt: Date;
};

/** One consuming session (an appointment linked to the instance, not cancelled). */
export type PackSession = { appointmentId: string; startsAt: Date };

export type PackInUseView = {
  instanceId: string;
  patientId: string;
  patientName: string;
  packName: string;
  packPriceCents: number;
  sessionsTotal: number;
  purchasedAt: Date;
  /** RESERVADAS: legacy plus linked non-cancelled appointments. */
  reserved: number;
  /** LIVRES: what is left to book, never below zero. */
  free: number;
  /** Realizadas: legacy sessions plus linked sessions whose time has passed. */
  done: number;
  /** Por Realizar: linked sessions still in the future. */
  upcoming: number;
  /** Sessions spent before appointments were linked to pacotes (0067). */
  legacyConsumed: number;
  /** The linked sessions in time order; numbered after the legacy ones. */
  sessions: PackSession[];
  /**
   * "Última utilização": the start of the latest linked session whose time
   * has passed (see `lastPackUse`). Null when no linked session has passed yet.
   */
  lastUsedAt: Date | null;
};

/**
 * "Última utilização" (Q15, 2026-11-04), stated once.
 *
 * A pacote session is used by an appointment linked to the instance
 * (`appointments.pack_instance_id`) in a consuming status: not cancelled,
 * no-shows included, the same visits `packSessionsConsumed` counts. Nothing
 * records WHEN a session was taken off the pacote, so the use is dated by the
 * visit's own start. The last use is the latest such start that is not in the
 * future (`startsAt <= now`, the same line that splits Realizadas from Por
 * Realizar). A visit still ahead is a booking, not a use.
 *
 * Sessions spent before appointments were linked to pacotes (legacy_consumed,
 * 0067) carry no date at all, so they give no last use. A pacote whose only
 * use is legacy, or that has nothing but future bookings, reads null.
 */
export function lastPackUse(sessions: readonly PackSession[], now: Date): Date | null {
  let last: Date | null = null;
  for (const x of sessions) {
    const t = x.startsAt.getTime();
    if (t > now.getTime()) continue;
    if (last === null || t > last.getTime()) last = x.startsAt;
  }
  return last;
}

export function summarizePackInstance(
  row: PackInstanceRow,
  sessions: readonly PackSession[],
  now: Date,
): PackInUseView {
  const ordered = [...sessions].sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() || a.appointmentId.localeCompare(b.appointmentId),
  );
  const inputs = {
    sessionsTotal: row.sessionsTotal,
    legacyConsumed: row.legacyConsumed,
    linkedAppointments: ordered.length,
  };
  const upcoming = ordered.filter((x) => x.startsAt.getTime() > now.getTime()).length;
  return {
    instanceId: row.instanceId,
    patientId: row.patientId,
    patientName: row.patientName,
    packName: row.packName,
    packPriceCents: row.packPriceCents,
    sessionsTotal: row.sessionsTotal,
    purchasedAt: row.purchasedAt,
    reserved: packSessionsConsumed(inputs),
    free: packSessionsAvailable(inputs),
    done: row.legacyConsumed + (ordered.length - upcoming),
    upcoming,
    legacyConsumed: row.legacyConsumed,
    sessions: ordered,
    lastUsedAt: lastPackUse(ordered, now),
  };
}

/** The in-use rule: a free session, or a reserved session still ahead. */
export function isPackInUse(v: Pick<PackInUseView, "free" | "upcoming">): boolean {
  return v.free > 0 || v.upcoming > 0;
}

/**
 * THE CHEAP PRE-FILTER, and why it cannot drop a pacote that is in use.
 *
 * The read first counts linked appointments under the viewer's own RLS, which
 * can see FEWER of them than exist (a therapist does not read a colleague's
 * visits). Fewer linked visits can only make the free count LARGER, so any
 * instance whose true free count is above zero passes here too. The exact
 * numbers then come from 0108's function, for the candidates only.
 *
 * The one case it can miss is a pacote that is already overdrawn AND whose only
 * future visit the viewer cannot see: its visible free count is 0 and it shows
 * no visible future visit. That needs a cancelled visit marked attended again,
 * and is recorded in DECISIONS rather than paid for with one function call per
 * pacote ever sold.
 */
export function isInUseCandidate(c: {
  sessionsTotal: number;
  legacyConsumed: number;
  visibleLinked: number;
  visibleUpcoming: number;
}): boolean {
  const visibleFree = packSessionsAvailable({
    sessionsTotal: c.sessionsTotal,
    legacyConsumed: c.legacyConsumed,
    linkedAppointments: c.visibleLinked,
  });
  return visibleFree > 0 || c.visibleUpcoming > 0;
}

const ACCENTED = "áàâãäçéèêëíìîïóòôõöúùûüýÿñ";
const PLAIN = "aaaaaceeeeiiiiooooouuuuyyn";

/** Lower case, accents folded: the same fold the patient list search uses. */
export function foldForSearch(value: string): string {
  let out = "";
  for (const ch of value.toLowerCase()) {
    const i = ACCENTED.indexOf(ch);
    out += i === -1 ? ch : PLAIN[i];
  }
  return out;
}

/**
 * "Pesquisa rápida de utente": every typed word must appear in the patient's
 * name, in any order, ignoring case and accents. The patient list's rule
 * (lib/patients/name-search.ts), applied to rows already read.
 */
export function matchesPatientSearch(patientName: string, query: string): boolean {
  const tokens = query.split(/\s+/).filter((t) => t.length > 0).map(foldForSearch);
  if (tokens.length === 0) return true;
  const name = foldForSearch(patientName);
  return tokens.every((t) => name.includes(t));
}

const collator = new Intl.Collator("pt-PT", { sensitivity: "base" });

/** NOME UTENTE A to Z; then the pacote's name; then the newest purchase first. */
export function comparePacksInUse(a: PackInUseView, b: PackInUseView): number {
  return (
    collator.compare(a.patientName, b.patientName) ||
    collator.compare(a.packName, b.packName) ||
    b.purchasedAt.getTime() - a.purchasedAt.getTime() ||
    a.instanceId.localeCompare(b.instanceId)
  );
}

/**
 * The page's sort. "name" is the default order above (NOME UTENTE A to Z);
 * "lastUse" is "Última utilização" (Q15): the most recent use first, every
 * pacote never used (no dated use, see `lastPackUse`) after all the used ones.
 */
export type PacksInUseSort = "name" | "lastUse";

/** The `?sort=` value, read safely: anything but "lastUse" is the default. */
export function parsePacksInUseSort(raw: string | undefined): PacksInUseSort {
  return raw === "lastUse" ? "lastUse" : "name";
}

/**
 * Most recent use first; never used last. Equal last uses (and the never-used
 * group) keep the default order, so the result is total and does not depend on
 * the order the rows arrived in.
 */
export function comparePacksByLastUse(a: PackInUseView, b: PackInUseView): number {
  const ta = a.lastUsedAt?.getTime() ?? null;
  const tb = b.lastUsedAt?.getTime() ?? null;
  if (ta !== tb) {
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  }
  return comparePacksInUse(a, b);
}

/** The URL for one sort option; the default sort is left out of it. */
export function packsSortHref(q: string, sort: PacksInUseSort): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (sort !== "name") params.set("sort", sort);
  const qs = params.toString();
  return qs ? `/patients/packs?${qs}` : "/patients/packs";
}

/** A sorted copy; the input is not touched. */
export function sortPacksInUse(rows: readonly PackInUseView[], sort: PacksInUseSort): PackInUseView[] {
  return [...rows].sort(sort === "lastUse" ? comparePacksByLastUse : comparePacksInUse);
}

export type PacksInUsePage = {
  /** "N PACKS a decorrer": every pacote in use the viewer can see, search or not. */
  totalInUse: number;
  /** The rows the table shows: in use, matching the search, sorted. */
  rows: PackInUseView[];
  /**
   * True when the read stopped at PACKS_IN_USE_READ_CAP candidates. The page
   * then says it shows the most recent ones, and the count is a floor.
   */
  truncated: boolean;
};

/**
 * THE READ IS BOUNDED. At most this many candidate pacotes (newest purchase
 * first) are read, and each costs one call of 0108's function. Fisiozero
 * showed 127 running; ten times that is far above the clinic's size, so the
 * cap changes nothing it does today and only stops a runaway, such as
 * imported pacotes with sessions left over that will never be used. It is NOT
 * an age limit, and there is none: Q15 (2026-11-04, answering
 * Q-PACKS-IN-USE-1) ruled that a pacote with sessions left stays "a decorrer"
 * however old it is. The "Última utilização" sort is how old ones are found.
 */
export const PACKS_IN_USE_READ_CAP = 1000;

export function buildPacksInUse(
  rows: readonly PackInstanceRow[],
  sessionsByInstance: ReadonlyMap<string, readonly PackSession[]>,
  now: Date,
  query: string,
): PacksInUsePage {
  const inUse = rows
    .map((r) => summarizePackInstance(r, sessionsByInstance.get(r.instanceId) ?? [], now))
    .filter(isPackInUse);
  const shown = inUse.filter((v) => matchesPatientSearch(v.patientName, query)).sort(comparePacksInUse);
  return { totalInUse: inUse.length, rows: shown, truncated: false };
}

/** "450" for whole euros, "237,50" otherwise. No currency sign: the caller adds "€". */
export function formatEurosShort(cents: number): string {
  if (cents % 100 === 0) return String(cents / 100);
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Who may open the page: the two capabilities its rows need. Today every staff
 * role holds both, and what each one sees is narrowed by the database (the
 * patients a viewer may read), never by this check.
 */
export const PACKS_IN_USE_CAPABILITIES = ["patients:read", "appointments:read"] as const;
