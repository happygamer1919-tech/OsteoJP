import { describe, expect, it } from "vitest";
import {
  FICHA_MEDICA_AI_KEYS,
  FICHA_MEDICA_KEY,
  projectAiPayloadOntoFichaFields,
  readFichaKeyPath,
} from "./ficha-medica";
import { resolveCurrentTemplates, type VersionedTemplate } from "./template-version";

// W5-13 — Ficha Médica unification, key-identity, and the existing-records-
// untouched invariant. The DB read in listActiveTemplates is now filtered to
// FICHA_MEDICA_KEY (records.ts); these tests model that filter + the version
// collapse over the same shape listActiveTemplates feeds resolveCurrentTemplates,
// so the picker's single-template behaviour is machine-verifiable without a DB.

type Row = VersionedTemplate & { id: string; title: string };

// The full seeded template set after W5-13: osteopathy now has v1/v2 (legacy,
// immutable) + v3 "Ficha Médica"; the other keys still exist as rows (never
// deleted) but are RETIRED FROM CREATION.
const ALL_TEMPLATES: Row[] = [
  { id: "ficha_geral-1", key: "ficha_geral", version: 1, title: "Ficha Geral" },
  { id: "nesa-1", key: "nesa", version: 1, title: "NESA" },
  { id: "osteo-1", key: "osteopathy", version: 1, title: "Osteopatia" },
  { id: "osteo-2", key: "osteopathy", version: 2, title: "Osteopatia" },
  { id: "osteo-3", key: "osteopathy", version: 3, title: "Ficha Clínica" },
  { id: "physio-3", key: "physiotherapy", version: 3, title: "Fisioterapia" },
  { id: "physio-4", key: "physiotherapy", version: 4, title: "Fisioterapia" },
];

/** Mirror of listActiveTemplates' new query: filter to FICHA_MEDICA_KEY, then
 *  collapse to the current (highest) version — exactly what the picker offers. */
function pickerOffers(rows: Row[]): Row[] {
  return resolveCurrentTemplates(rows.filter((r) => r.key === FICHA_MEDICA_KEY));
}

describe("key-identity decision (SPEC sec 2, recommended path)", () => {
  it("Ficha Médica IS the osteopathy key (so template=osteopathy maps by identity)", () => {
    expect(FICHA_MEDICA_KEY).toBe("osteopathy");
  });

  it("carries exactly the twelve AI keys, dotted paths for systems_review.*", () => {
    expect(FICHA_MEDICA_AI_KEYS).toHaveLength(12);
    expect(FICHA_MEDICA_AI_KEYS).toEqual([
      "consultation_reason",
      "relief_aggravation",
      "clinical_history",
      "systems_review.neurological",
      "systems_review.cardiovascular",
      "systems_review.respiratory",
      "systems_review.gastrointestinal",
      "systems_review.urological_gynecological",
      "systems_review.endocrine",
      "treatment_objectives",
      "treatment_plan",
      "observations",
    ]);
  });
});

describe("creation picker offers ONLY Ficha Clínica (SPEC sec 1)", () => {
  it("offers exactly one template — Ficha Clínica (osteopathy, current version)", () => {
    const offered = pickerOffers(ALL_TEMPLATES);
    expect(offered).toHaveLength(1);
    expect(offered[0]!.key).toBe("osteopathy");
    expect(offered[0]!.version).toBe(3);
    expect(offered[0]!.title).toBe("Ficha Clínica");
  });

  it("retires ficha_geral / physiotherapy / nesa from creation (not selectable)", () => {
    const offeredKeys = pickerOffers(ALL_TEMPLATES).map((r) => r.key);
    expect(offeredKeys).not.toContain("ficha_geral");
    expect(offeredKeys).not.toContain("physiotherapy");
    expect(offeredKeys).not.toContain("nesa");
  });

  it("never offers a superseded osteopathy version (v1/v2) on creation", () => {
    const offeredIds = pickerOffers(ALL_TEMPLATES).map((r) => r.id);
    expect(offeredIds).toEqual(["osteo-3"]);
    expect(offeredIds).not.toContain("osteo-1");
    expect(offeredIds).not.toContain("osteo-2");
  });
});

describe("EXISTING RECORDS UNTOUCHED — retiring from creation deletes no row, rewrites nothing", () => {
  // An existing clinical_record pins a specific formTemplateId and is resolved
  // BY ID (records.ts joins formTemplates on the stored id), NOT through the
  // creation picker. So a record authored against a now-retired template still
  // renders with its original structure.
  const byPinnedId = (id: string) => ALL_TEMPLATES.find((r) => r.id === id) ?? null;

  it("a record pinned to physiotherapy v4 still resolves to physiotherapy v4 (retired from creation)", () => {
    const pinned = byPinnedId("physio-4");
    expect(pinned?.key).toBe("physiotherapy");
    expect(pinned?.version).toBe(4);
    // ...while the creation picker no longer offers physiotherapy at all.
    expect(pickerOffers(ALL_TEMPLATES).some((r) => r.key === "physiotherapy")).toBe(false);
  });

  it("a record pinned to nesa v1 or ficha_geral v1 still resolves by its pinned id", () => {
    expect(byPinnedId("nesa-1")?.key).toBe("nesa");
    expect(byPinnedId("ficha_geral-1")?.key).toBe("ficha_geral");
  });

  it("a record pinned to legacy osteopathy v1/v2 keeps its version even though v3 is current", () => {
    expect(byPinnedId("osteo-1")?.version).toBe(1);
    expect(byPinnedId("osteo-2")?.version).toBe(2);
    // The picker offers v3, but the pinned rows stay addressable (non-destructive).
    expect(pickerOffers(ALL_TEMPLATES)[0]!.version).toBe(3);
  });

  it("the retirement is non-destructive: every retired/legacy row stays in the source set", () => {
    // Filtering the picker must not remove any row from form_templates.
    pickerOffers(ALL_TEMPLATES);
    expect(ALL_TEMPLATES).toHaveLength(7);
    for (const id of ["ficha_geral-1", "nesa-1", "osteo-1", "osteo-2", "physio-3", "physio-4"]) {
      expect(byPinnedId(id)).not.toBeNull();
    }
  });
});

describe("readFichaKeyPath — dotted-path resolution for the compatibility assertion", () => {
  const src = {
    consultation_reason: "a",
    systems_review: { neurological: "n", cardiovascular: null },
  };
  it("reads a top-level key", () => {
    expect(readFichaKeyPath(src, "consultation_reason")).toBe("a");
  });
  it("reads a nested systems_review.* leaf", () => {
    expect(readFichaKeyPath(src, "systems_review.neurological")).toBe("n");
  });
  it("returns undefined for an absent path (never throws)", () => {
    expect(readFichaKeyPath(src, "systems_review.respiratory")).toBeUndefined();
    expect(readFichaKeyPath(src, "missing.deep.path")).toBeUndefined();
  });
});

describe("projectAiPayloadOntoFichaFields — W5-17 Assumir → Ficha Médica editor mapping", () => {
  // The raw payload as the ingestion endpoint stores it (store.ts): the twelve
  // keys sit under data._aiIngestionRaw at their Ficha Médica field paths
  // (identity, W5-13). Distinct sentinel values so each mapped value is assertable.
  const rawPayload = {
    template: "osteopathy",
    consultation_reason: "VAL_consultation_reason",
    relief_aggravation: "VAL_relief_aggravation",
    clinical_history: "VAL_clinical_history",
    systems_review: {
      neurological: "VAL_neurological",
      cardiovascular: "VAL_cardiovascular",
      respiratory: "VAL_respiratory",
      gastrointestinal: "VAL_gastrointestinal",
      urological_gynecological: "VAL_urological_gynecological",
      endocrine: "VAL_endocrine",
    },
    treatment_objectives: "VAL_treatment_objectives",
    treatment_plan: "VAL_treatment_plan",
    observations: "VAL_observations",
  };
  const expectedFor = (path: string) => `VAL_${path.split(".").at(-1)!}`;

  it("projects all twelve AI values onto their Ficha Médica field paths — EDITABLE, none dropped", () => {
    const { data, projected, absent } = projectAiPayloadOntoFichaFields({
      _aiIngestionRaw: rawPayload,
    });
    // Every one of the twelve keys is now reachable at its FIELD PATH in `data`
    // (not just under _aiIngestionRaw) so the editor renders it in its field.
    for (const path of FICHA_MEDICA_AI_KEYS) {
      expect(readFichaKeyPath(data, path), `key "${path}"`).toBe(expectedFor(path));
    }
    expect(projected).toEqual([...FICHA_MEDICA_AI_KEYS]);
    expect(absent).toEqual([]);
  });

  it("keeps _aiIngestionRaw untouched as the source of truth", () => {
    const { data } = projectAiPayloadOntoFichaFields({ _aiIngestionRaw: rawPayload });
    expect(data._aiIngestionRaw).toEqual(rawPayload);
  });

  it("never overwrites a value already saved at a field path (a reviewer edit wins)", () => {
    const { data } = projectAiPayloadOntoFichaFields({
      _aiIngestionRaw: rawPayload,
      consultation_reason: "REVIEWER_EDIT",
    });
    // The reviewer's saved value survives; the AI value does NOT clobber it.
    expect(data.consultation_reason).toBe("REVIEWER_EDIT");
    // The other eleven still project.
    expect(readFichaKeyPath(data, "observations")).toBe("VAL_observations");
  });

  it("a key the AI did not fill is recorded absent, never invented — field renders empty", () => {
    const partial = {
      _aiIngestionRaw: {
        template: "osteopathy",
        consultation_reason: "only_this_one",
        systems_review: { neurological: "n" },
      },
    };
    const { data, projected, absent } = projectAiPayloadOntoFichaFields(partial);
    expect(readFichaKeyPath(data, "consultation_reason")).toBe("only_this_one");
    expect(readFichaKeyPath(data, "systems_review.neurological")).toBe("n");
    // Unfilled keys are absent (empty/editable), not fabricated.
    expect(readFichaKeyPath(data, "observations")).toBeUndefined();
    expect(projected).toEqual(["consultation_reason", "systems_review.neurological"]);
    expect(absent.length).toBe(FICHA_MEDICA_AI_KEYS.length - 2);
  });

  it("a record with no _aiIngestionRaw is returned unchanged (not an AI draft)", () => {
    const input = { consultation_reason: "manual" };
    const { data, projected } = projectAiPayloadOntoFichaFields(input);
    expect(data).toBe(input);
    expect(projected).toEqual([]);
  });
});

/**
 * The partner is moving extraction to a strict JSON schema, which declares every
 * property required and expresses an unfilled one as null. Our standing contract
 * says omit unfilled fields and never send nulls. Those collide, so the
 * projection absorbs the difference on our side: a null, an empty string and an
 * omitted key are all "the AI did not fill this".
 *
 * The two guards are NOT symmetric, and that is the point of the last two tests
 * here. Blank arriving FROM the AI is noise. Blank sitting AT a field path is a
 * reviewer who cleared it on purpose.
 */
describe("projectAiPayloadOntoFichaFields — null and empty-value hardening", () => {
  const rawWith = (overrides: Record<string, unknown>) => ({
    template: "osteopathy",
    consultation_reason: "VAL_consultation_reason",
    ...overrides,
  });

  it("a null value is recorded absent and never reaches the field path", () => {
    const { data, projected, absent } = projectAiPayloadOntoFichaFields({
      _aiIngestionRaw: rawWith({ observations: null }),
    });

    expect(readFichaKeyPath(data, "observations")).toBeUndefined();
    expect(absent).toContain("observations");
    expect(projected).not.toContain("observations");
  });

  it("a null on a nested systems_review leaf is recorded absent", () => {
    const { data, projected, absent } = projectAiPayloadOntoFichaFields({
      _aiIngestionRaw: rawWith({
        systems_review: { neurological: null, cardiovascular: "VAL_cardiovascular" },
      }),
    });

    expect(readFichaKeyPath(data, "systems_review.neurological")).toBeUndefined();
    expect(absent).toContain("systems_review.neurological");
    // The sibling that DID carry a value is unaffected.
    expect(readFichaKeyPath(data, "systems_review.cardiovascular")).toBe(
      "VAL_cardiovascular",
    );
    expect(projected).toContain("systems_review.cardiovascular");
  });

  it("an empty string and a whitespace-only string are both recorded absent", () => {
    const { data, projected, absent } = projectAiPayloadOntoFichaFields({
      _aiIngestionRaw: rawWith({
        observations: "",
        treatment_plan: "   ",
        // Tabs and newlines count as whitespace too — a "\n" is what a cleared
        // textarea round-trips as, and it must not render as a filled field.
        treatment_objectives: "\n\t \r\n",
      }),
    });

    for (const path of ["observations", "treatment_plan", "treatment_objectives"]) {
      expect(readFichaKeyPath(data, path), `key "${path}"`).toBeUndefined();
      expect(absent, `key "${path}"`).toContain(path);
      expect(projected, `key "${path}"`).not.toContain(path);
    }
  });

  it("an existing NULL at a field path is treated as unset and IS filled by the AI value", () => {
    const { data } = projectAiPayloadOntoFichaFields({
      _aiIngestionRaw: rawWith({ observations: "VAL_observations" }),
      // A null already sitting at the field path — no reviewer intent, just an
      // empty slot. The AI value fills it.
      observations: null,
    });

    expect(readFichaKeyPath(data, "observations")).toBe("VAL_observations");
  });

  it("an existing EMPTY STRING at a field path is a reviewer's deliberate clear and is NOT overwritten", () => {
    const { data, projected } = projectAiPayloadOntoFichaFields({
      _aiIngestionRaw: rawWith({ observations: "VAL_observations" }),
      observations: "",
    });

    // THE ASYMMETRY, asserted. "" from the AI would have been skipped; "" already
    // at the field path is a value and survives.
    expect(readFichaKeyPath(data, "observations")).toBe("");
    // Still counted as projected — the key WAS present in the payload; the write
    // was declined by the clobber guard, which is the pre-existing contract for a
    // reviewer edit.
    expect(projected).toContain("observations");
  });

  it("a whitespace-only string already at a field path is likewise not overwritten", () => {
    const { data } = projectAiPayloadOntoFichaFields({
      _aiIngestionRaw: rawWith({ observations: "VAL_observations" }),
      observations: "   ",
    });

    expect(readFichaKeyPath(data, "observations")).toBe("   ");
  });

  it("leaves non-string falsy values alone — 0 and false are real answers, not blanks", () => {
    const { data, projected, absent } = projectAiPayloadOntoFichaFields({
      _aiIngestionRaw: rawWith({ observations: 0, treatment_plan: false }),
    });

    // Only null, undefined and blank STRINGS are skipped. A 0 or a false is a
    // filled answer; dropping it would lose clinical content.
    expect(readFichaKeyPath(data, "observations")).toBe(0);
    expect(readFichaKeyPath(data, "treatment_plan")).toBe(false);
    expect(projected).toEqual(
      expect.arrayContaining(["observations", "treatment_plan"]),
    );
    expect(absent).not.toContain("observations");
    expect(absent).not.toContain("treatment_plan");
  });

  it("existing behaviour for present non-empty values is unchanged", () => {
    const full = {
      template: "osteopathy",
      consultation_reason: "VAL_consultation_reason",
      relief_aggravation: "VAL_relief_aggravation",
      clinical_history: "VAL_clinical_history",
      systems_review: {
        neurological: "VAL_neurological",
        cardiovascular: "VAL_cardiovascular",
        respiratory: "VAL_respiratory",
        gastrointestinal: "VAL_gastrointestinal",
        urological_gynecological: "VAL_urological_gynecological",
        endocrine: "VAL_endocrine",
      },
      treatment_objectives: "VAL_treatment_objectives",
      treatment_plan: "VAL_treatment_plan",
      observations: "VAL_observations",
    };
    const { data, projected, absent } = projectAiPayloadOntoFichaFields({
      _aiIngestionRaw: full,
    });

    for (const path of FICHA_MEDICA_AI_KEYS) {
      expect(readFichaKeyPath(data, path), `key "${path}"`).toBe(
        `VAL_${path.split(".").at(-1)!}`,
      );
    }
    expect(projected).toEqual([...FICHA_MEDICA_AI_KEYS]);
    expect(absent).toEqual([]);
    expect(data._aiIngestionRaw).toEqual(full);
  });

  it("an all-null payload projects nothing and marks all twelve absent", () => {
    const { data, projected, absent } = projectAiPayloadOntoFichaFields({
      _aiIngestionRaw: {
        template: "osteopathy",
        consultation_reason: null,
        relief_aggravation: null,
        clinical_history: null,
        systems_review: {
          neurological: null,
          cardiovascular: null,
          respiratory: null,
          gastrointestinal: null,
          urological_gynecological: null,
          endocrine: null,
        },
        treatment_objectives: null,
        treatment_plan: null,
        observations: null,
      },
    });

    // This is the shape the strict-schema partner will send for a sparse
    // extraction: every key present, every unfilled one null. It must behave
    // exactly like the omitted-key payload, not fill twelve fields with null.
    expect(projected).toEqual([]);
    expect(absent).toEqual([...FICHA_MEDICA_AI_KEYS]);
    for (const path of FICHA_MEDICA_AI_KEYS) {
      expect(readFichaKeyPath(data, path), `key "${path}"`).toBeUndefined();
    }
  });
});

/**
 * ==========================================================================
 * AI-02 — a key the partner sends that maps to no ficha field.
 * ==========================================================================
 * The projection walked the allowlist and copied what it found; it never looked
 * the other way. A key with no field was stored verbatim under
 * `_aiIngestionRaw` and reached no field, no editor and no reviewer's eye.
 * INVISIBLE, not absent, and the reported instance is why that distinction is
 * not academic: two such keys arrived and ONE WAS AN ALARM-SYMPTOM ANSWER.
 *
 * THE FIRST TEST IS THE ONE THAT MATTERS. The trap in this card is comparing
 * the payload's TOP-LEVEL keys against the TWELVE DOTTED PATHS, which flags
 * `systems_review` — the most important container in the payload — as drift on
 * every single record. The allowlist must be derived with `split(".")[0]`.
 */
describe("AI-02 — unknown payload keys are reported, never silently discarded", () => {
  const withRaw = (raw: Record<string, unknown>) =>
    projectAiPayloadOntoFichaFields({ _aiIngestionRaw: raw });

  it("does NOT flag the known containers - `systems_review` is not drift", () => {
    // THE REGRESSION THIS CARD WARNS ABOUT. If this fails, the allowlist was
    // hand-written or compared against the dotted paths, and every record in
    // the system reports a false alarm.
    const { unknown } = withRaw({
      consultation_reason: "x",
      systems_review: { neurological: "n", cardiovascular: "c" },
      template: "ficha-medica",
      _internal: "envelope",
    });
    expect(unknown).toEqual([]);
  });

  it("flags a top-level key the contract has no field for", () => {
    const { unknown } = withRaw({ consultation_reason: "x", alarm_symptoms: "yes" });
    expect(unknown).toEqual(["alarm_symptoms"]);
  });

  it("flags an unknown leaf INSIDE systems_review, reported dotted", () => {
    // Same invisibility and the same clinical weight as a top-level key, and
    // the shape the reported incident had.
    const { unknown } = withRaw({
      systems_review: { neurological: "n", red_flags: "yes" },
    });
    expect(unknown).toEqual(["systems_review.red_flags"]);
  });

  it("ignores the envelope: `template` and anything underscore-prefixed", () => {
    const { unknown } = withRaw({ template: "t", _aiMeta: 1, _v: 2 });
    expect(unknown).toEqual([]);
  });

  it("REPORTS THE KEY, NEVER THE VALUE (rule 7)", () => {
    // An unknown key's value IS clinical content by definition. The name says
    // where to look; the original payload holds the rest.
    const { unknown } = withRaw({ alarm_symptoms: "chest pain radiating to arm" });
    expect(unknown).toEqual(["alarm_symptoms"]);
    expect(JSON.stringify(unknown)).not.toMatch(/chest pain/);
  });

  it("does not block: the known keys still project alongside the unknown one", () => {
    // ANNOTATE, NEVER BLOCK. A claim that fails because the partner added a key
    // is a worse outage than a key that goes unread.
    const { data, projected, unknown } = withRaw({
      consultation_reason: "dor lombar",
      alarm_symptoms: "yes",
    });
    expect(unknown).toEqual(["alarm_symptoms"]);
    expect(projected).toContain("consultation_reason");
    expect(data.consultation_reason).toBe("dor lombar");
  });

  it("reports nothing when there is no AI payload at all", () => {
    expect(projectAiPayloadOntoFichaFields({}).unknown).toEqual([]);
  });
});
