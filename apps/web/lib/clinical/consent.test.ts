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

describe("consent state (SPEC 7.3) - explicit ternary, migration-free", () => {
  it("a fresh block has every item explicitly unset (never a bare box)", () => {
    const c = emptyConsentState();
    expect(c).toEqual({ treatment: "unset", rgpd: "unset" });
    // Every item is an EXPLICIT state - no undefined / missing item.
    for (const key of CONSENT_ITEM_KEYS) expect(c[key]).toBeTypeOf("string");
  });

  it("reads all-unset from a legacy record with no consent block", () => {
    expect(readConsentState({ consultation_reason: "x" })).toEqual(emptyConsentState());
    expect(readConsentState(null)).toEqual(emptyConsentState());
    expect(readConsentState(undefined)).toEqual(emptyConsentState());
  });

  it("round-trips granted / denied / unset through data._consent", () => {
    const consent: ConsentState = { treatment: "granted", rgpd: "denied" };
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
    expect(readConsentState({ _consent: { rgpd: "granted", treatment: "banana" } })).toEqual({
      treatment: "unset",
      rgpd: "granted",
    });
    expect(readConsentState({ _consent: [1, 2, 3] })).toEqual(emptyConsentState());
  });

  it("uses an underscore-prefixed key that never collides with a template field", () => {
    // The AI ingestion + template keys are bare (no leading underscore); the
    // consent block key must not shadow one of them.
    expect(CONSENT_DATA_KEY.startsWith("_")).toBe(true);
  });
});

describe("consent wording (SPEC 7, W5-33) - final texts, two items, i18n parity", () => {
  const pt = getStrings("pt");
  const en = getStrings("en");

  it("exposes exactly the two final consent items in order", () => {
    expect([...CONSENT_ITEM_KEYS]).toEqual(["treatment", "rgpd"]);
  });

  it("no consent body is a placeholder any more (both locales)", () => {
    for (const key of CONSENT_ITEM_KEYS) {
      const bodyKey = CONSENT_ITEM_STRINGS[key].body;
      expect(pt[bodyKey]).not.toContain("PENDENTE");
      expect(en[bodyKey]).not.toContain("PENDENTE");
      expect(pt[bodyKey].length).toBeGreaterThan(80);
      expect(en[bodyKey].length).toBeGreaterThan(80);
    }
  });

  it("renders TEXT 1 (treatment) verbatim in pt-PT", () => {
    expect(pt["clinical.consent.treatment.body"]).toBe(
      "Declaro que fui informado/a, de forma clara e compreensível, sobre a natureza, os objetivos e os possíveis efeitos do tratamento proposto, tendo tido oportunidade de colocar questões e de obter resposta às mesmas. Consinto, de forma livre e esclarecida, a realização do tratamento proposto. Posso retirar este consentimento a qualquer momento, sem necessidade de justificação e sem prejuízo dos cuidados que me venham a ser prestados.",
    );
  });

  it("renders TEXT 2 (RGPD) verbatim in pt-PT", () => {
    expect(pt["clinical.consent.rgpd.body"]).toBe(
      "Nos termos do Regulamento Geral sobre a Proteção de Dados (Regulamento (UE) 2016/679) e da Lei n. 58/2019, autorizo o tratamento dos meus dados pessoais e de saúde por esta clínica, com a finalidade exclusiva de prestação de cuidados de saúde, gestão clínica e administrativa e cumprimento de obrigações legais. Os meus dados são conservados pelo período legalmente exigido para registos clínicos e não são partilhados com terceiros, salvo obrigação legal ou serviços estritamente necessários à prestação de cuidados. Posso exercer, a qualquer momento, os direitos de acesso, retificação, apagamento (nos limites legais aplicáveis aos registos de saúde), limitação e oposição, contactando a clínica.",
    );
  });

  it("renders TEXT 3 (recording) verbatim in pt-PT on the Iniciar consulta step", () => {
    expect(pt["consultation.consentLabel"]).toBe(
      "Autorizo a gravação de áudio desta consulta e o seu processamento por sistemas de inteligência artificial, com a finalidade exclusiva de apoiar a elaboração do meu registo clínico. A gravação é processada de forma segura no Espaço Económico Europeu e é eliminada automaticamente após o processamento. O conteúdo resultante é sempre revisto e validado pelo profissional de saúde antes de integrar o meu processo clínico. Este consentimento é facultativo: a recusa não afeta, de forma alguma, a prestação dos cuidados de saúde. Posso retirar este consentimento a qualquer momento.",
    );
  });

  it("labels resolve (non-empty) in both locales", () => {
    for (const key of CONSENT_ITEM_KEYS) {
      const labelKey = CONSENT_ITEM_STRINGS[key].label;
      expect(pt[labelKey]).toBeTruthy();
      expect(en[labelKey]).toBeTruthy();
    }
  });

  it("carries no em dash or en dash in the three final texts (pt + en)", () => {
    const keys = ["clinical.consent.treatment.body", "clinical.consent.rgpd.body", "consultation.consentLabel"] as const;
    const DASH = /[\u2013\u2014]/; // en dash / em dash
    for (const k of keys) {
      expect(pt[k]).not.toMatch(DASH);
      expect(en[k]).not.toMatch(DASH);
    }
  });
});
