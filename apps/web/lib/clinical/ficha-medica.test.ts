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
