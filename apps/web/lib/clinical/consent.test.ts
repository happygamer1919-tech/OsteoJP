import { describe, expect, it } from "vitest";
import { getStrings } from "@osteojp/i18n";
import {
  CONSENT_DATA_KEY,
  CONSENT_ITEM_KEYS,
  CONSENT_ITEM_STRINGS,
  emptyConsentState,
  readConsentState,
  writeConsentState,
  type ConsentState,
} from "./consent";

describe("consent state (SPEC 7.3) — explicit ternary, migration-free", () => {
  it("a fresh block has every item explicitly unset (never a bare box)", () => {
    const c = emptyConsentState();
    expect(c).toEqual({ rgpd: "unset", sms: "unset", dataHandling: "unset" });
    // Every item is an EXPLICIT state — no undefined / missing item.
    for (const key of CONSENT_ITEM_KEYS) expect(c[key]).toBeTypeOf("string");
  });

  it("reads all-unset from a legacy record with no consent block", () => {
    expect(readConsentState({ consultation_reason: "x" })).toEqual(emptyConsentState());
    expect(readConsentState(null)).toEqual(emptyConsentState());
    expect(readConsentState(undefined)).toEqual(emptyConsentState());
  });

  it("round-trips granted / denied / unset through data._consent", () => {
    const consent: ConsentState = { rgpd: "granted", sms: "denied", dataHandling: "unset" };
    const data = writeConsentState({ observations: "ok" }, consent);
    // The template field is preserved; the block rides under the reserved key.
    expect(data.observations).toBe("ok");
    expect(data[CONSENT_DATA_KEY]).toEqual(consent);
    expect(readConsentState(data)).toEqual(consent);
  });

  it("does not mutate the input data object", () => {
    const data = { observations: "ok" };
    writeConsentState(data, emptyConsentState());
    expect(data).toEqual({ observations: "ok" });
  });

  it("falls back to unset for a partial or garbage block", () => {
    expect(readConsentState({ _consent: { rgpd: "granted", sms: "banana" } })).toEqual({
      rgpd: "granted",
      sms: "unset",
      dataHandling: "unset",
    });
    expect(readConsentState({ _consent: [1, 2, 3] })).toEqual(emptyConsentState());
  });

  it("uses an underscore-prefixed key that never collides with a template field", () => {
    // The AI ingestion + template keys are bare (no leading underscore); the
    // consent block key must not shadow one of them.
    expect(CONSENT_DATA_KEY.startsWith("_")).toBe(true);
  });
});

describe("consent wording (SPEC 7 / Q-W5-3) — PENDENTE-JP, 2-3 variants, i18n parity", () => {
  const pt = getStrings("pt");
  const en = getStrings("en");

  it("every consent body is a PENDENTE-JP placeholder in both locales", () => {
    for (const key of CONSENT_ITEM_KEYS) {
      const bodyKey = CONSENT_ITEM_STRINGS[key].body;
      expect(pt[bodyKey]).toContain("PENDENTE-JP");
      expect(en[bodyKey]).toContain("PENDENTE-JP");
    }
  });

  it("each item ships 3 drafted, PENDENTE-JP variants for JP to pick", () => {
    for (const key of CONSENT_ITEM_KEYS) {
      const variants = CONSENT_ITEM_STRINGS[key].variants;
      expect(variants.length).toBeGreaterThanOrEqual(2);
      expect(variants.length).toBeLessThanOrEqual(3);
      for (const vKey of variants) {
        expect(pt[vKey]).toContain("PENDENTE-JP");
        expect(en[vKey]).toContain("PENDENTE-JP");
        // Variants are distinct drafts, not duplicates of the active body.
        expect(pt[vKey]).not.toBe(pt[CONSENT_ITEM_STRINGS[key].body]);
      }
    }
  });

  it("labels resolve (non-empty) in both locales", () => {
    for (const key of CONSENT_ITEM_KEYS) {
      const labelKey = CONSENT_ITEM_STRINGS[key].label;
      expect(pt[labelKey]).toBeTruthy();
      expect(en[labelKey]).toBeTruthy();
    }
  });
});
