import { describe, it, expect } from "vitest";

import {
  emailOrNull,
  formEmailNote,
  formEmailNotOnRecord,
  withFormEmail,
  GUEST_REQUEST_PARAM,
  bookingDeepLink,
  guestRequestBookingLink,
  guestRequestIdFromParam,
  guestRequestPrefill,
  pressAction,
} from "./guest-convert-handoff";

/**
 * GUEST-06 — the two client rules of the convert.
 *
 * These exist because the component they came out of cannot be driven: this repo
 * renders with `renderToStaticMarkup` and has no DOM harness, so a branch inside
 * an `onClick` and a URL built inline are both unreachable from a test. Pulling
 * them into functions is what makes the assertions below possible at all.
 */

describe("pressAction - a flagged row asks before it converts", () => {
  it("converts directly when NOTHING matches", () => {
    // The ordinary case, and the one that must stay one press: reception should
    // not answer a question that has no alternatives.
    expect(pressAction(0)).toEqual({ kind: "convert_new" });
  });

  it("ASKS when one patient matches", () => {
    expect(pressAction(1)).toEqual({ kind: "ask" });
  });

  it("ASKS when several match, which is the case that must never guess", () => {
    // 0062: resolvePatientByProvenPhone REFUSES on several rather than picking.
    expect(pressAction(3)).toEqual({ kind: "ask" });
    expect(pressAction(50)).toEqual({ kind: "ask" });
  });

  it("ASKS on a negative count rather than treating it as 'no matches'", () => {
    // Unreachable through the product today. It is asserted because the failure
    // direction is what matters: `possiblePatientMatches !== 0` and
    // `possiblePatientMatches > 0` read identically and differ exactly here, and
    // the second one converts silently on a corrupted prop.
    expect(pressAction(-1)).toEqual({ kind: "ask" });
  });
});

describe("bookingDeepLink - the four param names the agenda reads back", () => {
  const link = bookingDeepLink("p-1", {
    serviceId: "svc-1",
    locationId: "loc-lv",
    date: "2026-08-21",
  });

  it("targets the agenda's create drawer", () => {
    expect(link.startsWith("/agenda?")).toBe(true);
  });

  it.each([
    ["novaMarcacaoPaciente", "p-1"],
    ["novaMarcacaoServico", "svc-1"],
    ["novaMarcacaoLocal", "loc-lv"],
    ["date", "2026-08-21"],
  ])("carries %s", (key, value) => {
    // ASSERTED LITERALLY, BY NAME. These four strings are a contract with
    // agenda/page.tsx, which reads them off `searchParams`. A rename on either
    // side does not throw and does not blank the screen - the drawer opens on
    // its defaults, which looks exactly like a working booking form. Nothing
    // else in the system would report it.
    const params = new URL(link, "https://x").searchParams;
    expect(params.get(key)).toBe(value);
  });

  it("opens the DAY view, because reception is placing one appointment on a known date", () => {
    expect(new URL(link, "https://x").searchParams.get("view")).toBe("day");
  });

  it("carries NO time, because the guest never chose one", () => {
    // GUEST-04 Option A: the stored window encodes a date and a PERIOD. A time
    // in this link would be an invention, rendered in the field reception is
    // there to decide - the same class of false precision the queue's
    // "Preferência" label exists to prevent.
    const params = new URL(link, "https://x").searchParams;
    expect(params.get("time")).toBeNull();
    expect(link).not.toContain("09:00");
  });

  it("escapes values rather than concatenating them into the query", () => {
    const odd = bookingDeepLink("p&x=1", {
      serviceId: "s 1",
      locationId: "l#1",
      date: "2026-08-21",
    });
    const params = new URL(odd, "https://x").searchParams;
    expect(params.get("novaMarcacaoPaciente")).toBe("p&x=1");
    expect(params.get("novaMarcacaoServico")).toBe("s 1");
    expect(params.get("novaMarcacaoLocal")).toBe("l#1");
  });
});

/**
 * BOOK-CONFIRM, S-1004-A (R40): the deep link carries the guest request, so the
 * booking made from it can be linked to the request.
 */
describe("bookingDeepLink - the guest request id rides the link", () => {
  const REQUEST = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
  const prefill = { serviceId: "svc-1", locationId: "loc-lv", date: "2026-08-21" };

  it("carries the request id under the name the agenda reads, asserted literally", () => {
    const params = new URL(bookingDeepLink("p-1", prefill, REQUEST), "https://x").searchParams;
    expect(GUEST_REQUEST_PARAM).toBe("pedidoConvidado");
    expect(params.get("pedidoConvidado")).toBe(REQUEST);
    // And the four it always carried are untouched.
    expect(params.get("novaMarcacaoPaciente")).toBe("p-1");
    expect(params.get("novaMarcacaoServico")).toBe("svc-1");
    expect(params.get("novaMarcacaoLocal")).toBe("loc-lv");
    expect(params.get("date")).toBe("2026-08-21");
  });

  it("a link built WITHOUT a request is exactly the link it was before", () => {
    const link = bookingDeepLink("p-1", prefill);
    expect(new URL(link, "https://x").searchParams.has("pedidoConvidado")).toBe(false);
    expect(link).toBe(
      "/agenda?novaMarcacaoPaciente=p-1&novaMarcacaoServico=svc-1&novaMarcacaoLocal=loc-lv&date=2026-08-21&view=day",
    );
  });
});

describe("guestRequestIdFromParam - shape only, the server decides the rest", () => {
  it("passes a uuid through, trimmed", () => {
    expect(guestRequestIdFromParam(" 0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f ")).toBe(
      "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f",
    );
  });

  it.each([null, undefined, "", "abc", "0f0f0f0f-0f0f-4f0f-8f0f", "'; drop table x; --", "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f0"])(
    "%j is not a request id",
    (value) => {
      expect(guestRequestIdFromParam(value)).toBeNull();
    },
  );
});

/**
 * BOOK-CONFIRM: the link a CONVERTED row offers ("Marcar consulta") is the
 * link the convert redirects to. Both are built from the same two functions,
 * and this asserts the result is the same string.
 */
describe("guestRequestBookingLink - the row's own link is the redirect's link", () => {
  const REQUEST = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
  const request = {
    id: REQUEST,
    convertedPatientId: "p-1" as string | null,
    serviceId: "svc-1",
    locationId: "loc-lv",
    // 23:30 UTC on 6 September is 00:30 on the 7th in Lisbon (WEST).
    requestedStartsAt: new Date("2026-09-06T23:30:00.000Z"),
  };

  it("the prefill is the service, the clinic and the LISBON date, never the time", () => {
    expect(guestRequestPrefill(request)).toEqual({
      serviceId: "svc-1",
      locationId: "loc-lv",
      date: "2026-09-07",
    });
  });

  it("is exactly what the convert's redirect builds for the same request", () => {
    const redirect = bookingDeepLink("p-1", guestRequestPrefill(request), REQUEST);
    expect(guestRequestBookingLink(request)).toBe(redirect);
    const params = new URL(redirect, "https://x").searchParams;
    expect(params.get("novaMarcacaoPaciente")).toBe("p-1");
    expect(params.get("pedidoConvidado")).toBe(REQUEST);
    expect(params.get("date")).toBe("2026-09-07");
  });

  it("a request that is NOT converted has no link", () => {
    expect(guestRequestBookingLink({ ...request, convertedPatientId: null })).toBeNull();
  });
});

/**
 * 0101, ruling R40 - what reception is told about the email a visitor typed.
 * The lead's decision of 2026-10-05: a NEW patient gets the address; an EXISTING
 * patient's record is never written, and reception is told so.
 */
describe("the form's email: one meaning of 'none', and what reception is told", () => {
  const ADDRESS = "guest.fixture@example.invalid";

  it("NO EMAIL is NULL, absent, or nothing after a trim, and an address comes back trimmed", () => {
    for (const none of [null, undefined, "", " ", "\t\n  "]) expect(emailOrNull(none)).toBeNull();
    expect(emailOrNull(`  ${ADDRESS} `)).toBe(ADDRESS);
  });

  it("NOT ON THE RECORD: the request has one, and the patient has none, a blank one, or another", () => {
    for (const held of [null, undefined, "", "   ", "held.fixture@example.invalid"]) {
      expect(formEmailNotOnRecord(ADDRESS, held), JSON.stringify(held)).toBe(true);
    }
    // THE SAME ADDRESS is on the record already, whatever its case and padding.
    for (const held of [ADDRESS, ADDRESS.toUpperCase(), `  ${ADDRESS}  `]) {
      expect(formEmailNotOnRecord(ADDRESS, held), JSON.stringify(held)).toBe(false);
    }
    // A request WITHOUT an address has nothing that could be missing from a record.
    for (const typed of [null, undefined, "", "   "]) {
      expect(formEmailNotOnRecord(typed, null)).toBe(false);
      expect(formEmailNotOnRecord(typed, "held.fixture@example.invalid")).toBe(false);
    }
  });

  it("THE NOTE: a new patient is told it is SAVED, an existing one that it is NOT, and nothing is said when there is nothing to say", () => {
    expect(formEmailNote(ADDRESS, { kind: "new_patient" })).toBe("new_patient_saved");
    expect(formEmailNote(ADDRESS, { kind: "existing_patient", formEmailNotOnRecord: true })).toBe("existing_not_saved");
    expect(formEmailNote(ADDRESS, { kind: "existing_patient", formEmailNotOnRecord: false })).toBe("none");
    for (const none of [null, undefined, "", "  "]) {
      expect(formEmailNote(none, { kind: "new_patient" })).toBe("none");
      // Even if a stale flag said otherwise: no address, no note.
      expect(formEmailNote(none, { kind: "existing_patient", formEmailNotOnRecord: true })).toBe("none");
    }
  });

  it("the address is put into the sentence LITERALLY: a `$&` in it is not a replacement pattern", () => {
    expect(withFormEmail("O pedido indica o email {email}.", ADDRESS)).toBe(`O pedido indica o email ${ADDRESS}.`);
    expect(withFormEmail("({email})", "a$&b$1@example.invalid")).toBe("(a$&b$1@example.invalid)");
    expect(withFormEmail("no placeholder", ADDRESS)).toBe("no placeholder");
  });
});

