import { describe, expect, it } from "vitest";
import { normalizePhonePT } from "./phone";
import { noSmsReason, parsePatientPhone } from "./patient-phone";
import { ACCEPTED, REFUSED } from "./patient-phone.cases";
import { isSmsCapablePT } from "./sms-capability";

// GATE BL-1a (PHONE-01), at the parser. Every accepted input shape, with every
// separator the ruling names, asserted BYTE FOR BYTE against the stored value
// with toBe. The same table is driven through the patient validation layer in
// apps/web/lib/patients/validation.test.ts.

describe("parsePatientPhone: every accepted shape stores E.164, byte for byte", () => {
  for (const [input, stored, kind] of ACCEPTED) {
    it(`${JSON.stringify(input)} stores ${stored} (${kind})`, () => {
      const r = parsePatientPhone(input);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.e164).toBe(stored);
      expect(r.kind).toBe(kind);
    });
  }

  it("the stored value is + and digits only, for every accepted row", () => {
    for (const [input] of ACCEPTED) {
      const r = parsePatientPhone(input);
      expect(r.ok && r.e164 !== null && /^\+[1-9]\d{7,14}$/.test(r.e164)).toBe(true);
    }
  });
});

describe("parsePatientPhone: a number that cannot be normalised is refused with its reason", () => {
  for (const [input, reason] of REFUSED) {
    it(`${JSON.stringify(input)} is refused as ${reason}`, () => {
      const r = parsePatientPhone(input);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe(reason);
      expect(r.message.length).toBeGreaterThan(20);
    });
  }

  it("the refusal names the digit count where a count is the problem", () => {
    const r = parsePatientPhone("+35191234567");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("Número português inválido: deve ter 9 dígitos depois do indicativo 351 (tem 8).");
    const bare = parsePatientPhone("91234567");
    expect(bare.ok).toBe(false);
    if (!bare.ok)
      expect(bare.message).toBe(
        "Telemóvel inválido: indique 9 dígitos, ou o número completo com o indicativo do país (+ ou 00). Tem 8 dígitos.",
      );
  });
});

describe("parsePatientPhone: nothing typed is no phone, not a refusal", () => {
  for (const input of ["", "   ", null, undefined]) {
    it(`${JSON.stringify(input)} is none`, () => {
      expect(parsePatientPhone(input)).toEqual({ ok: true, kind: "none", e164: null });
    });
  }
});

describe("parsePatientPhone agrees with normalizePhonePT, the reminder path's own definition", () => {
  // The Portuguese half is not a second copy of the rule. For every input in both
  // tables, a PT answer here is exactly normalizePhonePT's answer, and a number
  // normalizePhonePT accepts is never refused here.
  const corpus = [...ACCEPTED.map((r) => r[0]), ...REFUSED.map((r) => r[0])];
  for (const input of corpus) {
    it(`${JSON.stringify(input)}`, () => {
      const r = parsePatientPhone(input);
      const pt = normalizePhonePT(input);
      if (pt !== null) {
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.e164).toBe(pt);
      }
      if (r.ok && (r.kind === "pt_mobile" || r.kind === "pt_landline")) {
        expect(pt).toBe(r.e164);
      }
    });
  }
});

describe("noSmsReason: the marker is shown exactly when the reminder path would not send", () => {
  const cases: ReadonlyArray<[stored: string | null, reason: ReturnType<typeof noSmsReason>]> = [
    ["+351912345678", null],
    ["912 345 678", null], // imported free text the reminder path normalises
    ["+351213456789", "landline"],
    ["21 345 67 89", "landline"],
    ["+447700900123", "foreign"],
    ["912 345 67a", "unparseable"],
    ["sem telefone", "unparseable"],
    [null, null],
    ["", null],
  ];
  for (const [stored, reason] of cases) {
    it(`${JSON.stringify(stored)} -> ${String(reason)}`, () => {
      expect(noSmsReason(stored)).toBe(reason);
    });
  }

  it("null means an SMS can reach it (or there is no phone), for the whole corpus", () => {
    // The reminder path sends iff normalizePhonePT accepts AND isSmsCapablePT
    // passes (apps/web/lib/reminders/dispatch.ts sendPatientSms). The marker must
    // be the negation of that, or it lies in one direction.
    const corpus = [...ACCEPTED.map((r) => r[0]), ...REFUSED.map((r) => r[0])];
    for (const input of corpus) {
      const pt = normalizePhonePT(input);
      const sends = pt !== null && isSmsCapablePT(pt);
      expect(noSmsReason(input) === null).toBe(sends);
    }
  });
});
