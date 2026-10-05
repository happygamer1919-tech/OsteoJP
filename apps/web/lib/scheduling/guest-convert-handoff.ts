/**
 * GUEST-06 — the two client-side rules of the convert, as functions.
 *
 * WHY THEY ARE NOT INLINE IN THE COMPONENT. This repo renders components with
 * `renderToStaticMarkup` and has no DOM harness, so a rule that lives inside an
 * `onClick` is a rule no test can reach: it would be asserted by reading it.
 * Both rules below are load-bearing and neither is obvious, so each gets a name,
 * a file and a suite - the same move `guest-preferred-when.ts` made "so the rule
 * can be tested directly".
 *
 * NEITHER IS A SECURITY BOUNDARY. `convertGuestRequest` re-derives the match set
 * and re-checks the location and role on every call; the agenda re-validates
 * every prefilled id against the options it loaded. These decide what reception
 * is ASKED and where they LAND, which is the product, not the guard.
 */

import { lisbonParts } from "./time";

/** What pressing the convert button on a queue row should do. */
export type ConvertPress =
  | { kind: "convert_new" }
  | { kind: "ask" };

/**
 * ZERO MATCHES CONVERTS; ANYTHING ELSE ASKS FIRST.
 *
 * The count comes from the server, rendered into the row. A flagged row cannot
 * be converted by pressing the primary button, because the primary button stops
 * being a convert - it becomes "open the question". That is the whole of
 * flag-never-link on the client: not a warning beside a button that still does
 * the wrong thing, but a button that does not do it.
 *
 * A NEGATIVE COUNT IS TREATED AS "ASK", and it is worth saying why rather than
 * writing `=== 0`. The only ways to reach a negative here are a corrupted prop
 * or a future refactor; both are unknown states, and PORTAL-REHYDRATE §1.3 puts
 * an unknown on the cautious side of a decision about identity. Asking a
 * needless question costs a click. Not asking costs a merged medical record.
 */
export function pressAction(possiblePatientMatches: number): ConvertPress {
  return possiblePatientMatches === 0 ? { kind: "convert_new" } : { kind: "ask" };
}

/**
 * The deep link a successful convert lands on: the ordinary staff booking flow,
 * opened on the patient the convert resolved, with the service, clinic and
 * preferred date filled in.
 *
 * THE PARAM NAMES ARE THE CONTRACT, AND THIS IS THE ONLY PLACE THEY ARE WRITTEN
 * ON THE SENDING SIDE. `agenda/page.tsx` reads exactly these four. Renaming one
 * end silently disables a prefill - the drawer would simply open on its
 * defaults, which looks like a working screen, so nothing would report it. The
 * suite beside this file asserts the names literally for that reason.
 *
 * `novaMarcacaoPaciente` IS REUSED RATHER THAN REINVENTED. W6-03 already opens
 * the create drawer from a patient profile with that param; a converted guest
 * wants the same drawer in the same state, plus more. A second param meaning
 * "open the create drawer" would have been a second way to express one thing.
 *
 * `view=day` because reception is about to place ONE appointment on ONE date
 * they already know. The week grid would make them find it first.
 *
 * THE TIME IS ABSENT ON PURPOSE. Under GUEST-04 Option A the request stores a
 * date and a PERIOD; the start instant is how the period is encoded, not a time
 * anybody chose. Carrying it here would put an invented choice into the one
 * field reception exists to decide.
 */
export function bookingDeepLink(
  patientId: string,
  prefill: { serviceId: string; locationId: string; date: string },
  /**
   * BOOK-CONFIRM (S-1004-A, R40): the guest request this booking will answer.
   * It rides the link as `pedidoConvidado` so the booking action can LINK the
   * appointment to the request, which is what sends the patient their
   * confirmation and takes the request off the queue. Optional: a link built
   * without it opens the same drawer and books an ordinary appointment.
   *
   * It is an id in a URL and is treated as untrusted at the other end:
   * `createAppointment` verifies it inside its transaction.
   */
  guestRequestId?: string,
): string {
  const params = new URLSearchParams({
    novaMarcacaoPaciente: patientId,
    novaMarcacaoServico: prefill.serviceId,
    novaMarcacaoLocal: prefill.locationId,
    date: prefill.date,
    view: "day",
    ...(guestRequestId ? { [GUEST_REQUEST_PARAM]: guestRequestId } : {}),
  });
  return `/agenda?${params.toString()}`;
}

/**
 * What a guest request prefills the booking drawer with: the service and the
 * clinic it named, and the DATE it asked for, in Lisbon.
 *
 * ONE FUNCTION, TWO CALLERS, and that is the point. `convertGuestRequest`
 * returns this for the redirect it causes, and the queue builds the same link
 * again for a request that was converted and not booked at once
 * (`guestRequestBookingLink`). Two places computing "the date the guest asked
 * for" would be two places that could disagree about a request at 23:30 UTC.
 *
 * NOT THE TIME: under the GUEST-04 Option A ruling the stored window encodes a
 * date and a PERIOD, and the start instant is an encoding artefact rather than
 * a time anybody chose.
 */
export function guestRequestPrefill(request: {
  serviceId: string;
  locationId: string;
  requestedStartsAt: Date;
}): { serviceId: string; locationId: string; date: string } {
  return {
    serviceId: request.serviceId,
    locationId: request.locationId,
    date: lisbonParts(request.requestedStartsAt).date,
  };
}

/**
 * The booking deep link for a request that is ALREADY CONVERTED, built from
 * the row's own data, or null when it is not converted (there is nobody to
 * book for yet).
 *
 * WHY IT EXISTS. The redirect after a convert was the only place the link was
 * ever built. A drawer closed, a page refreshed or a booking that failed left
 * a converted request whose row offered only "Dispensar": reception could book
 * the patient by hand, but never in a way that LINKED the booking to the
 * request, so the patient got no confirmation and the request needed a
 * dismiss. The row now offers the same link again ("Marcar consulta").
 *
 * EXACTLY the link the redirect makes: the same builder, the same prefill
 * function, the same request id.
 */
export function guestRequestBookingLink(request: {
  id: string;
  convertedPatientId: string | null;
  serviceId: string;
  locationId: string;
  requestedStartsAt: Date;
}): string | null {
  if (!request.convertedPatientId) return null;
  return bookingDeepLink(request.convertedPatientId, guestRequestPrefill(request), request.id);
}

/** The deep link's name for the guest request id. Read by agenda/page.tsx. */
export const GUEST_REQUEST_PARAM = "pedidoConvidado";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The request id the agenda hands to the drawer: the param's value when it is
 * uuid-shaped, else null. SHAPE ONLY. Whether the request exists, is this
 * tenant's, is still open and was converted to the patient being booked is the
 * server's to decide, inside the booking's transaction; nothing here is a guard.
 */
export function guestRequestIdFromParam(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return UUID.test(v) ? v : null;
}
