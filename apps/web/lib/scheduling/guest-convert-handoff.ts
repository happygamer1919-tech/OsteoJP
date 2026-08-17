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
): string {
  const params = new URLSearchParams({
    novaMarcacaoPaciente: patientId,
    novaMarcacaoServico: prefill.serviceId,
    novaMarcacaoLocal: prefill.locationId,
    date: prefill.date,
    view: "day",
  });
  return `/agenda?${params.toString()}`;
}
