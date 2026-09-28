"use server";

import { unstable_rethrow } from "next/navigation";

import { listLinkablePacksAction } from "@/lib/packs/actions";
import {
  getAppointmentNotesAction,
  getPatientContraindications,
  getPatientNoSmsReason,
} from "@/lib/patients/actions";
import { getTherapistDayAvailability } from "./actions";
import { collectPieces, readDrawerLoadInput, type DrawerLoad, type PieceName } from "./drawer-load-core";

/**
 * SKEW-01 PR 2 - the one POST an existing marcacao opens with.
 *
 * Before this, opening one fired seven server actions, and Next sends server
 * actions ONE AT A TIME from a page, so they queued behind each other and one
 * slow read held up every read behind it. This loader makes the same five
 * reads in one request (the other two, the therapist's services and locations,
 * are not fetched on an edit open at all: see appointment-drawer.tsx).
 *
 * THE SAME FUNCTIONS, CALLED THE SAME WAY. Every piece below is the existing
 * exported action, called with the arguments the drawer used to POST to it.
 * Calling a "use server" export from server code is an ordinary function call,
 * so each piece runs its own guard, unchanged:
 *
 *   availability       getTherapistDayAvailability: authorize("appointments:read")
 *                      (requireRequestContext, then assertCan; a refusal is the
 *                      same { ok: false } value), then runScoped RLS.
 *   notes              getAppointmentNotesAction: requireRequestContext, assertCan
 *                      patients:read, the patient taken from the APPOINTMENT ROW
 *                      under RLS (never from this input), then getPatient's
 *                      therapist own-patient and location scope.
 *   contraindications  getPatientContraindications: requireRequestContext and
 *                      runScoped RLS only. No capability check, as before.
 *   noSms              getPatientNoSmsReason: requireRequestContext, assertCan
 *                      patients:read, runScoped RLS; the reason only, never the phone.
 *   linkable           listLinkablePacksAction: requireRequestContext, then
 *                      assertCan appointments:read and runScoped RLS in
 *                      listLinkablePacks.
 *
 * Nothing is merged, so no check is added, dropped or moved onto a different
 * id. The pieces run one after another (drawer-load-core.ts says why), each in
 * its own catch, and `unstable_rethrow` runs first in every catch, so an
 * expired session still redirects to /login exactly as it did.
 *
 * THIS MODULE EXPORTS ONE FUNCTION. In a "use server" module every export is a
 * browser-callable POST endpoint, so helpers and types live in
 * drawer-load-core.ts; drawer-load.test.ts pins the export list.
 */
export async function loadAppointmentDrawer(raw: unknown): Promise<DrawerLoad> {
  const input = readDrawerLoadInput(raw);
  return collectPieces(
    input,
    {
      availability: () =>
        getTherapistDayAvailability({
          therapistId: input.therapistId,
          date: input.date,
          locationId: input.locationId || null,
        }),
      notes: () => getAppointmentNotesAction(input.appointmentId),
      contraindications: () => getPatientContraindications(input.patientId),
      noSms: () => getPatientNoSmsReason(input.patientId),
      linkable: () => listLinkablePacksAction(input.appointmentId),
    },
    { rethrow: unstable_rethrow, report: reportPieceFailure },
  );
}

/**
 * A piece that THREW used to reach Next's onRequestError, which reports it to
 * Sentry (instrumentation.ts). Caught here, it would reach nothing, so it is
 * reported here instead. Tags only: the piece name, never an id (rule 7).
 *
 * Sentry is imported lazily, inside the failure path, as lib/auth/context.ts
 * does: this module is in the server graph of every page that opens the
 * drawer, and nothing on the success path should depend on it loading.
 *
 * NOT EXPORTED: an export here would be a browser-callable action.
 */
async function reportPieceFailure(piece: PieceName, error: unknown): Promise<void> {
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(error, { tags: { server_action: "drawer-loader", piece } });
  } catch {
    // Reporting must never turn one failed piece into a failed loader.
  }
}
