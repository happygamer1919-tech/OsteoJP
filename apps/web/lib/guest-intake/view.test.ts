import { describe, expect, it } from "vitest";

// The row type, the enum labels and the parser live with the SQL in packages/db
// (src/guest-intake-reads.ts); packages/db only collects tests/**, so the parser's
// unit tests stay here beside the display they feed.
import { INTAKE_ANSWERS, parseGuestIntakeRow } from "@osteojp/db";
import { s } from "@/lib/i18n";
import {
  intakeAnswerWords,
  toGuestIntakeDisplay,
  type GuestIntakeDisplay,
  type GuestIntakeRecord,
} from "./view";

/**
 * INTAKE-01 - the staff rendering of a guest intake. Three rules, each asserted:
 * never a blank, verbatim, attributed and dated.
 */

const base: GuestIntakeRecord = {
  guestBookingRequestId: "11111111-1111-4111-8111-111111111111",
  dateOfBirth: "1980-02-29",
  reason: "Dor lombar há três semanas",
  healthConditions: null,
  medication: null,
  fallsAccidents: null,
  surgeries: null,
  pacemaker: "nao",
  pregnancy: "nao",
  consentVersion: "rgpd-intake-2026-09-11",
  consentAt: "2026-09-11T14:20:00.000Z",
  createdAt: "2026-09-11T14:20:01.000Z",
};

const valueOf = (d: GuestIntakeDisplay, field: string) =>
  d.rows.find((r) => r.field === field)?.value;

/** The "never a blank" predicate, used by the sweep and by its negative control. */
const hasBlankValue = (d: GuestIntakeDisplay) =>
  d.rows.some((r) => r.value.trim() === "") || d.meta.some((m) => m.value.trim() === "");

describe("the three states are three different words", () => {
  it("each label has its own non-empty words, and never-asked is not 'Não'", () => {
    const words = INTAKE_ANSWERS.map(intakeAnswerWords);
    for (const w of words) expect(w.trim()).not.toBe("");
    expect(new Set(words).size).toBe(INTAKE_ANSWERS.length);
    expect(intakeAnswerWords("nao_perguntado")).toBe(s["guestIntake.answer.naoPerguntado"]);
    expect(intakeAnswerWords("nao_perguntado")).not.toBe(intakeAnswerWords("nao"));
  });

  it("a never-asked pacemaker and pregnancy render in words on the block", () => {
    const d = toGuestIntakeDisplay({ ...base, pacemaker: "nao_perguntado", pregnancy: "nao_perguntado" });
    expect(valueOf(d, "pacemaker")).toBe("Nunca perguntado");
    expect(valueOf(d, "pregnancy")).toBe("Nunca perguntado");
  });

  it("only a plain 'Não' is unemphasised; 'Sim' and never-asked are marked", () => {
    const d = toGuestIntakeDisplay({ ...base, pacemaker: "sim", pregnancy: "nao_perguntado" });
    expect(d.rows.find((r) => r.field === "pacemaker")!.emphasis).toBe(true);
    expect(d.rows.find((r) => r.field === "pregnancy")!.emphasis).toBe(true);
    const plain = toGuestIntakeDisplay(base);
    expect(plain.rows.find((r) => r.field === "pacemaker")!.emphasis).toBe(false);
  });
});

describe("never a blank, over every combination", () => {
  it("no row and no meta value is ever empty", () => {
    for (const pacemaker of INTAKE_ANSWERS) {
      for (const pregnancy of INTAKE_ANSWERS) {
        for (const text of [null, "", "   ", "x"]) {
          const d = toGuestIntakeDisplay({
            ...base,
            pacemaker,
            pregnancy,
            healthConditions: text,
            medication: text,
            fallsAccidents: text,
            surgeries: text,
          });
          expect(hasBlankValue(d)).toBe(false);
          expect(d.rows).toHaveLength(8);
        }
      }
    }
  });

  it("negative control: the predicate does flag a blank when one is there", () => {
    const d = toGuestIntakeDisplay(base);
    const blank: GuestIntakeDisplay = {
      ...d,
      rows: [...d.rows, { field: "surgeries", label: "x", value: "  ", emphasis: false }],
    };
    expect(hasBlankValue(blank)).toBe(true);
  });

  it("an optional question left empty says so in words", () => {
    const d = toGuestIntakeDisplay({ ...base, medication: null, surgeries: "  " });
    expect(valueOf(d, "medication")).toBe(s["guestIntake.noAnswer"]);
    expect(valueOf(d, "surgeries")).toBe(s["guestIntake.noAnswer"]);
  });
});

describe("verbatim", () => {
  it("free text keeps its line breaks, its leading spaces and its punctuation", () => {
    const typed = "  Ibuprofeno 400mg,\n  2x/dia <quando dói>  ";
    const d = toGuestIntakeDisplay({ ...base, medication: typed, reason: typed });
    expect(valueOf(d, "medication")).toBe(typed);
    expect(valueOf(d, "reason")).toBe(typed);
  });

  it("the date of birth is reformatted by string, never through a Date (no zone shift)", () => {
    expect(valueOf(toGuestIntakeDisplay(base), "dateOfBirth")).toBe("29/02/1980");
    expect(valueOf(toGuestIntakeDisplay({ ...base, dateOfBirth: "2000-01-01" }), "dateOfBirth")).toBe(
      "01/01/2000",
    );
  });
});

describe("attributed and dated", () => {
  it("says whose words these are and that a clinician has not confirmed them", () => {
    const d = toGuestIntakeDisplay(base);
    expect(d.attribution).toBe(s["guestIntake.attribution"]);
    expect(d.caveat).toBe(s["guestIntake.caveat"]);
    expect(d.requestId).toBe(base.guestBookingRequestId);
  });

  it("dates arrival and consent in Europe/Lisbon, and names the consent version", () => {
    const d = toGuestIntakeDisplay(base);
    // 14:20 UTC on 11 September is 15:20 in Lisbon (WEST, UTC+1).
    expect(d.meta).toEqual([
      { label: s["guestIntake.receivedAt"], value: "11/09/2026, 15:20" },
      { label: s["guestIntake.consentAt"], value: "11/09/2026, 15:20" },
      { label: s["guestIntake.consentVersion"], value: "rgpd-intake-2026-09-11" },
    ]);
  });
});

describe("parseGuestIntakeRow refuses rather than guesses, and never echoes a value", () => {
  const raw = {
    guest_booking_request_id: base.guestBookingRequestId,
    date_of_birth: base.dateOfBirth,
    reason: base.reason,
    health_conditions: null,
    medication: "Paracetamol",
    falls_accidents: null,
    surgeries: null,
    pacemaker: "nao_perguntado",
    pregnancy: "sim",
    consent_version: base.consentVersion,
    consent_at: base.consentAt,
    created_at: base.createdAt,
  };

  it("accepts a well-formed row, three-state labels included", () => {
    const r = parseGuestIntakeRow(raw);
    expect(r.pacemaker).toBe("nao_perguntado");
    expect(r.pregnancy).toBe("sim");
    expect(r.medication).toBe("Paracetamol");
    expect(r.healthConditions).toBeNull();
  });

  it("refuses an unknown answer label, naming the field and not the value", () => {
    const secret = "talvez-SEGREDO";
    let message = "";
    try {
      parseGuestIntakeRow({ ...raw, pacemaker: secret });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("pacemaker");
    expect(message).not.toContain(secret);
  });

  it("refuses a non-text free-text field without echoing it", () => {
    expect(() => parseGuestIntakeRow({ ...raw, reason: 42 })).toThrow(/reason is not text/);
  });
});
