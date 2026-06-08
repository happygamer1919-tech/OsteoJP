import { describe, expect, it } from "vitest";
import { validateFormSubmissionInput, describeFormCatalog, THERAPY_SLUGS } from "./catalog";

describe("validateFormSubmissionInput", () => {
  it("accepts the shared Ficha Geral with no therapy", () => {
    const r = validateFormSubmissionInput({ formKey: "ficha_geral", payload: { q1: "a" } });
    expect(r).toEqual({ ok: true, value: { formKey: "ficha_geral", therapy: null, payload: { q1: "a" } } });
  });

  it("accepts a supplement with a valid therapy", () => {
    const r = validateFormSubmissionInput({ formKey: "supplement", therapy: "osteopathy", payload: {} });
    expect(r).toEqual({ ok: true, value: { formKey: "supplement", therapy: "osteopathy", payload: {} } });
  });

  it("rejects an unknown form key", () => {
    expect(validateFormSubmissionInput({ formKey: "nope" })).toEqual({ ok: false, error: "unknown_form" });
  });

  it("requires a therapy for a supplement", () => {
    expect(validateFormSubmissionInput({ formKey: "supplement" })).toEqual({ ok: false, error: "therapy_required" });
  });

  it("rejects an unknown therapy", () => {
    expect(validateFormSubmissionInput({ formKey: "supplement", therapy: "voodoo" })).toEqual({
      ok: false,
      error: "unknown_therapy",
    });
  });

  it("rejects a therapy on the shared Ficha Geral", () => {
    expect(validateFormSubmissionInput({ formKey: "ficha_geral", therapy: "osteopathy" })).toEqual({
      ok: false,
      error: "therapy_not_allowed",
    });
  });

  it("rejects a non-object payload", () => {
    expect(validateFormSubmissionInput({ formKey: "ficha_geral", payload: "x" })).toEqual({
      ok: false,
      error: "invalid_payload",
    });
    expect(validateFormSubmissionInput({ formKey: "ficha_geral", payload: [1, 2] })).toEqual({
      ok: false,
      error: "invalid_payload",
    });
  });

  it("defaults an omitted payload to {}", () => {
    const r = validateFormSubmissionInput({ formKey: "ficha_geral" });
    expect(r.ok && r.value.payload).toEqual({});
  });
});

describe("describeFormCatalog", () => {
  it("lists Ficha Geral + one supplement per therapy (PT)", () => {
    const cat = describeFormCatalog("pt");
    expect(cat).toHaveLength(1 + THERAPY_SLUGS.length);
    expect(cat[0]).toEqual({ formKey: "ficha_geral", therapy: null, title: "Ficha Geral" });
    const osteo = cat.find((c) => c.therapy === "osteopathy");
    expect(osteo?.title).toContain("Osteopatia");
  });

  it("localizes to EN", () => {
    const cat = describeFormCatalog("en");
    expect(cat[0].title).toBe("General Intake Form");
  });
});
