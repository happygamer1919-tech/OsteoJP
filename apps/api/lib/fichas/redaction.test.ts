import { describe, expect, it } from "vitest";
import {
  redactRecordForPatient,
  PATIENT_VISIBLE_RECORD_FIELDS,
  PATIENT_VISIBLE_DATA_KEYS,
  KNOWN_PRIVATE_DATA_KEYS,
  type RawClinicalRecord,
} from "./redaction";

// Adversarial: a raw record stuffed with therapist-private + arbitrary content.
const SENTINEL = "THERAPIST_PRIVATE_DO_NOT_LEAK";
const raw: RawClinicalRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  status: "signed",
  version: 2,
  episodeId: "ep-1",
  createdAt: new Date("2026-05-20T09:30:00Z"),
  signedAt: new Date("2026-05-21T16:00:00Z"),
  data: {
    private_notes: SENTINEL, // the "NOTAS PESSOAIS" field — must NEVER leak
    red_flags: "suspected fracture",
    cid_codes: ["M54.5"],
    diagnosis: "low back pain",
    treatment_plan: "manual therapy",
    observations: "patient anxious",
  },
  // Adversarial extra columns that must not pass the allow-list:
  ...({ signedBy: "therapist-uuid", practitionerId: "therapist-uuid", secret: SENTINEL } as object),
};

describe("redactRecordForPatient — default-deny field-level redaction", () => {
  const out = redactRecordForPatient(raw);
  const serialized = JSON.stringify(out);

  it("NEVER serializes the private notes field (the critical guard)", () => {
    expect(serialized).not.toContain("private_notes");
    expect(serialized).not.toContain(SENTINEL);
  });

  it("never serializes any known therapist-private data key", () => {
    for (const key of KNOWN_PRIVATE_DATA_KEYS) {
      expect(out.data).not.toHaveProperty(key);
      expect(serialized).not.toContain(key);
    }
  });

  it("drops the entire freeform data blob by default (allow-list is empty)", () => {
    expect(PATIENT_VISIBLE_DATA_KEYS).toEqual([]);
    expect(out.data).toEqual({});
    // Even non-private clinical free-text is withheld pending clinical sign-off.
    expect(serialized).not.toContain("low back pain");
    expect(serialized).not.toContain("manual therapy");
  });

  it("exposes ONLY the allow-listed metadata fields, nothing else", () => {
    expect(Object.keys(out).sort()).toEqual([...PATIENT_VISIBLE_RECORD_FIELDS, "data"].sort());
    // arbitrary extra columns are not copied
    expect(out).not.toHaveProperty("signedBy");
    expect(out).not.toHaveProperty("practitionerId");
    expect(out).not.toHaveProperty("secret");
  });

  it("maps the allow-listed metadata correctly (dates → ISO)", () => {
    expect(out.id).toBe(raw.id);
    expect(out.status).toBe("signed");
    expect(out.version).toBe(2);
    expect(out.episodeId).toBe("ep-1");
    expect(out.createdAt).toBe("2026-05-20T09:30:00.000Z");
    expect(out.signedAt).toBe("2026-05-21T16:00:00.000Z");
  });

  it("handles null/absent data without leaking", () => {
    const out2 = redactRecordForPatient({ ...raw, data: null });
    expect(out2.data).toEqual({});
  });
});
