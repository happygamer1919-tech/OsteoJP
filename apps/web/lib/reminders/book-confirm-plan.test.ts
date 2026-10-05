/**
 * book-confirm-plan.test.ts - BOOK-CONFIRM: can a booking-approved message go?
 *
 * The three questions here are asked twice: by the dispatch when it sends, and
 * by the approver's notice when a request is approved. They are one set of
 * functions so the two can never answer differently, which they did once: the
 * notice looked only at the shape of the number, so a patient whose SMS was
 * switched off, and every patient at a location with no address, got nothing
 * and nobody was told.
 *
 * `bookingApprovedBlocker` is the composition the notice reads. Each row below
 * says what the DISPATCH does for the same appointment, because that agreement
 * is the property (book-confirm-dispatch.test.ts asserts the dispatch side).
 */
import { describe, expect, it } from "vitest";

import {
  bookingApprovedBlocker,
  bookingApprovedLocationContact,
  planBookingApprovedChannel,
  smsNumberVerdict,
  type BookingApprovedReachInput,
} from "./book-confirm-plan";

const MOBILE = "912 000 001";
const LANDLINE = "272 000 123";

const reachable: BookingApprovedReachInput = {
  patientEmail: "a@example.test",
  patientPhone: MOBILE,
  tenantSmsEnabled: true,
  patientSmsEnabled: true,
  locationAddress: "Rua de Exemplo 1",
  locationPhone: "+351 272 111 111",
};

describe("bookingApprovedBlocker: nothing can go, and why", () => {
  it.each([
    // label, overrides, expected
    ["an email and a mobile", {}, null],
    ["an email, no phone", { patientPhone: null }, null],
    ["an email, SMS switched off everywhere (the email is transactional)", { tenantSmsEnabled: false, patientSmsEnabled: false }, null],
    ["an email and a landline", { patientPhone: LANDLINE }, null],
    ["no email, a mobile: the SMS goes", { patientEmail: null }, null],
    ["a blank email, a mobile", { patientEmail: "   " }, null],

    ["no email, no phone", { patientEmail: null, patientPhone: null }, "patient_unreachable"],
    ["no email, a blank phone", { patientEmail: null, patientPhone: "  " }, "patient_unreachable"],
    // Spaces are not an address: the dispatch trims before it asks, so this must too.
    ["a BLANK email, no phone", { patientEmail: "   ", patientPhone: null }, "patient_unreachable"],
    ["no email, a LANDLINE", { patientEmail: null, patientPhone: LANDLINE }, "patient_unreachable"],
    ["no email, a number that does not normalise", { patientEmail: null, patientPhone: "12" }, "patient_unreachable"],
    ["no email, a mobile, the CLINIC has SMS off", { patientEmail: null, tenantSmsEnabled: false }, "patient_unreachable"],
    ["no email, a mobile, the PATIENT has SMS off", { patientEmail: null, patientSmsEnabled: false }, "patient_unreachable"],

    ["an email, the location has NO ADDRESS", { locationAddress: null }, "location_contact_missing"],
    ["an email, the location has NO PHONE", { locationPhone: null }, "location_contact_missing"],
    ["an email, a blank address", { locationAddress: "  " }, "location_contact_missing"],
    ["no email, a mobile, the location has no phone", { patientEmail: null, locationPhone: "" }, "location_contact_missing"],

    // The dispatch checks the patient first, so the notice does too.
    ["nobody to reach AND no location contact", { patientEmail: null, patientPhone: null, locationAddress: null }, "patient_unreachable"],
  ] as const)("%s -> %s", (_label, over, expected) => {
    expect(bookingApprovedBlocker({ ...reachable, ...over })).toBe(expected);
  });

  it("agrees with the three functions it is made of, for every combination", () => {
    for (const patientEmail of [null, "a@example.test"]) {
      for (const patientPhone of [null, MOBILE, LANDLINE, "12"]) {
        for (const tenantSmsEnabled of [true, false]) {
          for (const patientSmsEnabled of [true, false]) {
            for (const locationAddress of [null, "Rua A 1"]) {
              for (const locationPhone of [null, "210 000 000"]) {
                const input = { patientEmail, patientPhone, tenantSmsEnabled, patientSmsEnabled, locationAddress, locationPhone };
                const plan = planBookingApprovedChannel({
                  hasEmail: !!patientEmail,
                  hasPhone: !!patientPhone,
                  tenantSmsEnabled,
                  patientSmsEnabled,
                });
                const patientBlocked =
                  plan.send === "none" || (plan.send === "sms" && !smsNumberVerdict(patientPhone).ok);
                const expected = patientBlocked
                  ? "patient_unreachable"
                  : bookingApprovedLocationContact(input) === null
                    ? "location_contact_missing"
                    : null;
                expect(bookingApprovedBlocker(input), JSON.stringify(input)).toBe(expected);
              }
            }
          }
        }
      }
    }
  });
});
