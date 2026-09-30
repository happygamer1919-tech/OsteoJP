import type { NoSmsReason } from "@osteojp/notify";

import type { LinkablePacksView } from "@/lib/packs/link";
import type { PatientNoteRevision } from "@/lib/patients/note-revisions";
import type { PatientContraindications } from "./nesa";
import type { ActionResult, DayAvailability } from "./types";

/**
 * SKEW-01 PR 2 - ONE LOADER FOR THE READS AN EXISTING MARCACAO OPENS WITH.
 *
 * Pure: no React, no Next, no database. The "use server" module
 * (drawer-load.ts) and the drawer's client side (drawer-preload.ts) both build
 * on what is here, so the shape of a piece, the order the pieces run in and the
 * key each piece belongs to are written down once.
 *
 * WHAT A PIECE IS. Each piece is the value ONE existing server action returns
 * today, produced by calling that same action on the server with the same
 * arguments the drawer used to send it. Nothing is re-derived here, so every
 * capability check, tenant claim, location scope and care-team scope is the
 * one the action already applies. A value the action returns, including an
 * `{ ok: false }` refusal, is passed through untouched.
 */

/** Everything the drawer already holds when it opens an existing marcacao. */
export type DrawerLoadInput = {
  appointmentId: string;
  patientId: string;
  therapistId: string;
  /** The Lisbon calendar day, yyyy-mm-dd, as the drawer's form holds it. */
  date: string;
  locationId: string;
};

/** What each existing action returns. */
export type DrawerPieces = {
  /** getTherapistDayAvailability (lib/scheduling/actions.ts). */
  availability: ActionResult<DayAvailability>;
  /** getAppointmentNotesAction (lib/patients/actions.ts). */
  notes: { ok: boolean; notes: PatientNoteRevision[] };
  /** getPatientContraindications (lib/patients/actions.ts). */
  contraindications: PatientContraindications;
  /** getPatientNoSmsReason (lib/patients/actions.ts). */
  noSms: NoSmsReason | null;
  /** listLinkablePacksAction (lib/packs/actions.ts). */
  linkable: LinkablePacksView;
};

export type PieceName = keyof DrawerPieces;

/**
 * The order the pieces run in: the order the drawer's own fetches used to
 * reach the server (children first, then the drawer's effects as declared).
 */
export const PIECE_ORDER: readonly PieceName[] = [
  "availability",
  "notes",
  "contraindications",
  "noSms",
  "linkable",
];

/**
 * - ok: the action returned; `value` is exactly what it returned.
 * - error: the action THREW. The error was reported on the server and the
 *   client runs that piece's own action instead (drawer-preload.ts), so what
 *   the screen shows on a failure is what that read shows on a failure today.
 * - skipped: the input the drawer would never have fetched with (an empty id),
 *   so the action was not called. The drawer never asks for such a piece.
 */
export type DrawerPiece<T> = { status: "ok"; value: T } | { status: "error" } | { status: "skipped" };

export type DrawerLoad = { [K in PieceName]: DrawerPiece<DrawerPieces[K]> };

/** AvailabilityPanel's fetch key. The panel builds its own key with this, so the two cannot drift. */
export function availabilityKey(therapistId: string, date: string, locationId: string): string {
  return `${therapistId}|${date}|${locationId}`;
}

/**
 * The drawer's pacote fetch key. `tick` moves after every link attempt, so a
 * refetch after "Associar" never takes the value the drawer opened with.
 */
export function linkableKey(appointmentId: string, tick: number): string {
  return `${appointmentId}|${tick}`;
}

/** The key each piece was loaded for: a consumer takes a piece only for this key. */
export function drawerPieceKeys(input: DrawerLoadInput): Record<PieceName, string> {
  return {
    availability: availabilityKey(input.therapistId, input.date, input.locationId),
    notes: input.appointmentId,
    contraindications: input.patientId,
    noSms: input.patientId,
    linkable: linkableKey(input.appointmentId, 0),
  };
}

/**
 * The loader's input, read defensively: the POST body comes from a browser, so
 * anything that is not a string is read as "" and that piece is skipped, as the
 * drawer would never have asked for it.
 */
export function readDrawerLoadInput(raw: unknown): DrawerLoadInput {
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const str = (k: keyof DrawerLoadInput) => (typeof obj[k] === "string" ? (obj[k] as string) : "");
  return {
    appointmentId: str("appointmentId"),
    patientId: str("patientId"),
    therapistId: str("therapistId"),
    date: str("date"),
    locationId: str("locationId"),
  };
}

/**
 * Whether the drawer would have fetched this piece for this input. These are
 * the drawer's OWN guards, copied, not new ones: AvailabilityPanel returns
 * early without a therapist or a date, the patient effects without a patient,
 * and the notes board and the pacote effect only exist for an appointment.
 */
export function pieceWanted(name: PieceName, input: DrawerLoadInput): boolean {
  switch (name) {
    case "availability":
      return !!input.therapistId && !!input.date;
    case "notes":
    case "linkable":
      return !!input.appointmentId;
    case "contraindications":
    case "noSms":
      return !!input.patientId;
  }
}

export type PieceRunners = { [K in PieceName]: () => Promise<DrawerPieces[K]> };

export interface CollectDeps {
  /**
   * Called FIRST in every catch, before anything else looks at the error.
   * The server passes Next's `unstable_rethrow`, so a redirect() (an expired
   * session in requireRequestContext), a notFound() or any other control-flow
   * signal leaves the loader exactly as it leaves the action today.
   */
  rethrow(error: unknown): void;
  /** A piece threw: report it, as Next's onRequestError reported it before. Must not throw. */
  report(piece: PieceName, error: unknown): Promise<void> | void;
}

/**
 * Runs the pieces ONE AFTER ANOTHER, in PIECE_ORDER.
 *
 * SEQUENTIAL, ON PURPOSE. Each action opens its own runScoped transaction, and
 * the database pool is 6 connections per instance, shared by every concurrent
 * request on it (packages/db/src/client.ts). Before this loader Next's client
 * action queue already sent these reads one at a time, so a drawer open held at
 * most one connection; run in parallel they would take up to five of the six
 * for every open. One at a time keeps the pool exactly as it was, and what the
 * loader saves is the four extra browser round trips and the queue between
 * them, not database time.
 *
 * EACH PIECE IS CAUGHT ON ITS OWN, so one failing read never takes the others
 * down with it, which is how they failed before: independently.
 */
export async function collectPieces(
  input: DrawerLoadInput,
  runners: PieceRunners,
  deps: CollectDeps,
): Promise<DrawerLoad> {
  const out: Partial<Record<PieceName, DrawerPiece<unknown>>> = {};
  for (const name of PIECE_ORDER) {
    if (!pieceWanted(name, input)) {
      out[name] = { status: "skipped" };
      continue;
    }
    try {
      out[name] = { status: "ok", value: await runners[name]() };
    } catch (error) {
      deps.rethrow(error);
      try {
        await deps.report(name, error);
      } catch {
        // Reporting must never turn one failed piece into a failed loader.
      }
      out[name] = { status: "error" };
    }
  }
  return out as DrawerLoad;
}
