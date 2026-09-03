/**
 * INC-nif-validationerror-at-the-desk — the refusal reaches the desk, once.
 *
 * ==========================================================================
 * WHAT THIS FILE CAN PROVE AND WHAT IT DELIBERATELY LEAVES TO THE E2E
 * ==========================================================================
 * `createPatient` and `updatePatient` need a request context and a transaction,
 * so the DB-gated suites own their behaviour and the e2e owns the screen. Same
 * split `merge-form-error.test.ts` made for INC-CONFIRM-07b, and for the same
 * reason.
 *
 * What is provable here without a database or a browser is the whole of what
 * changed in the pure layer:
 *
 *   1. every refusal an operator can CAUSE names the box it belongs to;
 *   2. the placement rule and the form's markup agree, checked against the
 *      form's own source rather than against a second copy of the list; and
 *   3. the one conditional slot is only ever asked for in the state that
 *      renders it.
 *
 * (2) IS THE ONE WORTH EXPLAINING. `INLINE_ERROR_FIELDS` is a restatement of
 * something the component already expresses in JSX, and a restated rule drifts:
 * somebody adds a field, forgets the set, and the message silently moves to the
 * bottom of the form - or worse, adds it to the set with no slot in the markup
 * and the message renders NOWHERE, which is the defect this card is about,
 * reintroduced by its own fix. So the test reads `patient-form.tsx` and fails
 * with the exact difference. Same shape as the handover-count guard, which
 * restates `render-board.mjs`'s filter and then pins the renderer's source.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { INLINE_ERROR_FIELDS, errorSlot } from "./form-error";
import {
  ValidationError,
  parseCreatePatient,
  parseUpdatePatient,
  type CreatePatientInput,
  type PatientField,
} from "./validation";
import { CONSUMIDOR_FINAL_NIF } from "./nif";

const HERE = dirname(fileURLToPath(import.meta.url));
const FORM = join(HERE, "../../app/patients/_components/patient-form.tsx");

/** Everything a valid create needs, so a case can change exactly one thing. */
const ok: CreatePatientInput = { fullName: "Ana Costa", nif: "123456789" };

function refusal(input: CreatePatientInput): ValidationError {
  try {
    parseCreatePatient(input);
  } catch (e) {
    if (e instanceof ValidationError) return e;
    throw e;
  }
  throw new Error("expected a ValidationError and the input parsed");
}

describe("every refusal an operator can cause names the box it belongs to", () => {
  // The reported instance. Sentry 144696143 was a NIF that did not pass the
  // checksum, thrown out of createPatient on POST /patients/new.
  it("a bad checksum belongs to the NIF box", () => {
    const e = refusal({ ...ok, nif: "123456780" });
    expect(e.field).toBe("nif");
    expect(e.message).toMatch(/dígito de controlo/);
  });

  it("a NIF of the wrong length belongs to the NIF box", () => {
    expect(refusal({ ...ok, nif: "1234" }).field).toBe("nif");
  });

  it("a NIF with no valid prefix belongs to the NIF box", () => {
    // 000000000 satisfies the checksum and is the single most likely thing a
    // hurried user types to escape a required field; the prefix rule rejects it.
    expect(refusal({ ...ok, nif: "000000000" }).field).toBe("nif");
  });

  it("the consumidor-final number belongs to the NIF box, and says so", () => {
    const e = refusal({ ...ok, nif: CONSUMIDOR_FINAL_NIF });
    expect(e.field).toBe("nif");
    expect(e.message).toMatch(/consumidor final/i);
  });

  it("a missing NIF on CREATE belongs to the NIF box", () => {
    expect(refusal({ fullName: "Ana Costa" }).field).toBe("nif");
  });

  it("an exemption with no reason belongs to the REASON box, not the NIF box", () => {
    const e = refusal({ fullName: "Ana Costa", nifExempt: true });
    expect(e.field).toBe("nifExemptReason");
    expect(e.message).toMatch(/motivo/i);
  });

  it("an empty name belongs to the name box", () => {
    expect(refusal({ ...ok, fullName: "   " }).field).toBe("fullName");
  });

  it("a malformed email belongs to the email box", () => {
    expect(refusal({ ...ok, email: "not-an-email" }).field).toBe("email");
  });

  it("a malformed date belongs to the date box", () => {
    expect(refusal({ ...ok, dateOfBirth: "31/12/1980" }).field).toBe("dateOfBirth");
  });

  it("an unaccepted sex value belongs to the sex box", () => {
    expect(refusal({ ...ok, sex: "other" }).field).toBe("sex");
  });

  it("an over-long insurance list belongs to the insurance block, worded as before", () => {
    // The message keeps its old wording ("insurance number", "insurer") while
    // the FIELD is the one the form renders them under - which is why
    // optionalText takes the two separately.
    const entries = Array.from({ length: 11 }, () => ({ insurer: null, number: "1" }));
    const e = refusal({ ...ok, healthInsuranceNumbers: entries });
    expect(e.field).toBe("healthInsuranceNumbers");
  });

  it("a non-text insurance number keeps its wording and still names the block", () => {
    const e = refusal({
      ...ok,
      healthInsuranceNumbers: [{ insurer: null, number: 12345 as unknown as string }],
    });
    expect(e.field).toBe("healthInsuranceNumbers");
    expect(e.message).toBe("insurance number must be text");
  });

  it("a malformed clinic id belongs to the clinic picker", () => {
    expect(refusal({ ...ok, primaryLocationId: "not-a-uuid" }).field).toBe("primaryLocationId");
  });

  // PL-31, on the EDIT path: format is checked exactly as hard as at creation,
  // only presence is negotiable. Both arms below are the NIF box.
  it("an edit that types a bad NIF is the NIF box; an edit that types none is no refusal", () => {
    expect(() => parseUpdatePatient({ nif: "123456780" })).toThrow(ValidationError);
    expect(parseUpdatePatient({ nif: "" })).toEqual({
      nif: null,
      nifExempt: false,
      nifExemptReason: null,
    });
  });
});

describe("the exemption-reason slot is only asked for in the state that renders it", () => {
  /**
   * THE ONE CONDITIONAL SLOT. The reason input renders only while the
   * "Estrangeiro / sem NIF" box is ticked, so `nifExemptReason` is inline only
   * if the refusal cannot arise with the box unticked. It cannot: `resolveNif`
   * raises it on the exemption branch alone.
   *
   * THIS IS THE ASSERTION THAT LETS IT SIT IN INLINE_ERROR_FIELDS AT ALL. Every
   * other conditional field is form-level for exactly the want of it.
   */
  it("never refuses nifExemptReason while the exemption is unticked", () => {
    const unticked: CreatePatientInput[] = [
      { fullName: "Ana", nif: "" },
      { fullName: "Ana", nif: "123456780" },
      { fullName: "Ana", nif: CONSUMIDOR_FINAL_NIF },
      { fullName: "Ana", nifExempt: false, nifExemptReason: "" },
      // The reason present WITHOUT the tick: the reason is simply ignored, and
      // the NIF rule is what answers.
      { fullName: "Ana", nifExempt: false, nifExemptReason: "Passaporte" },
    ];
    for (const input of unticked) {
      expect(refusal(input).field).not.toBe("nifExemptReason");
    }
  });

  it("a ticked exemption with a reason is accepted, so the slot is not asked for either", () => {
    expect(
      parseCreatePatient({ fullName: "Ana", nifExempt: true, nifExemptReason: "Passaporte" }),
    ).toMatchObject({ nif: null, nifExempt: true, nifExemptReason: "Passaporte" });
  });
});

describe("the placement rule and the form's markup do not drift", () => {
  const source = readFileSync(FORM, "utf8");
  // `errorFor` is a prop name that appears nowhere else in the file, which is
  // why it is not called `name`: a regex for `name="..."` would have matched
  // every input on the page.
  const declared = new Set(
    [...source.matchAll(/errorFor="(\w+)"/g)].map((m) => m[1] as PatientField),
  );

  it("the form declares a slot for exactly the fields the rule calls inline", () => {
    expect([...declared].sort()).toEqual([...INLINE_ERROR_FIELDS].sort());
  });

  it("every inline field is one the form could actually refuse", () => {
    // A slot for a field no refusal names is dead markup; the reverse is the
    // message rendering nowhere. This half catches a typo in either list.
    for (const field of INLINE_ERROR_FIELDS) {
      expect(errorSlot(field)).toBe("inline");
    }
  });

  it("the fields with no slot are placed at form level, not dropped", () => {
    for (const field of [
      "healthInsuranceNumbers",
      "primaryLocationId",
      "referralSource",
      "contraindicationOtherNote",
      "address",
      "survivorId",
      "form",
    ] as PatientField[]) {
      expect(errorSlot(field)).toBe("form");
    }
  });

  it("the form renders the form-level paragraph ONLY for a form-level field", () => {
    // The strict-mode guarantee, asserted on the source: the bottom paragraph
    // is gated on errorSlot, so a message can never appear twice. Three cases
    // in nif-required.spec.ts locate the sentence with a plain getByText, and
    // Playwright fails a locator that resolves to two elements.
    expect(source).toContain('errorSlot(error.field) === "form"');
  });

  it("the inline slot is a role=alert beside the box, with a stable test id", () => {
    expect(source).toContain('data-testid={`field-error-${errorFor}`}');
  });
});
