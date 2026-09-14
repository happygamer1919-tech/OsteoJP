import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import { NO_SMS_MESSAGE_KEY, phonePreview } from "./phone-preview";

const s = getStrings(DEFAULT_LOCALE);

describe("phonePreview (PHONE-01): the line under the phone box", () => {
  it("nothing typed shows nothing", () => {
    expect(phonePreview("", undefined, s)).toBeNull();
    expect(phonePreview("   ", undefined, s)).toBeNull();
  });

  it("a mobile shows exactly the value that will be stored", () => {
    expect(phonePreview("912 345 678", undefined, s)).toEqual({
      tone: "ok",
      text: "Será guardado como +351912345678",
    });
  });

  it("a landline shows the stored value AND that SMS will not reach it", () => {
    expect(phonePreview("21 345 67 89", undefined, s)).toEqual({
      tone: "warning",
      text: "Será guardado como +351213456789. Telefone fixo: os lembretes por SMS não chegam a este número.",
    });
  });

  it("a foreign number shows the stored value AND that SMS reminders are PT-only", () => {
    expect(phonePreview("+44 7700 900123", undefined, s)).toEqual({
      tone: "warning",
      text: "Será guardado como +447700900123. Número estrangeiro: os lembretes por SMS só são enviados para números portugueses.",
    });
  });

  it("a number that cannot be normalised shows the server's own refusal sentence", () => {
    expect(phonePreview("91234567", undefined, s)).toEqual({
      tone: "error",
      text: "Telemóvel inválido: indique 9 dígitos, ou o número completo com o indicativo do país (+ ou 00). Tem 8 dígitos.",
    });
  });

  describe("on edit", () => {
    it("an unchanged legacy value is not refused: the server leaves it as it is, and the line says so", () => {
      expect(phonePreview("912 345 67a", "912 345 67a", s)).toEqual({
        tone: "warning",
        text: s["patients.phonePreviewLegacy"],
      });
      // Parseable but not E.164 as stored: also left as it is by the server.
      expect(phonePreview("912 345 678", "912 345 678", s)?.text).toBe(s["patients.phonePreviewLegacy"]);
    });

    it("an unchanged value already in E.164 reads as a normal save", () => {
      expect(phonePreview("+351912345678", "+351912345678", s)).toEqual({
        tone: "ok",
        text: "Será guardado como +351912345678",
      });
    });

    it("a CHANGED value is previewed and refused like a new one", () => {
      expect(phonePreview("91234567", "912 345 67a", s)?.tone).toBe("error");
      expect(phonePreview("913 000 000", "912 345 67a", s)?.text).toBe("Será guardado como +351913000000");
    });
  });
});

describe("NO_SMS_MESSAGE_KEY: every reason has a sentence in both locales", () => {
  it.each(["pt", "en"] as const)("%s", (locale) => {
    const strings = getStrings(locale);
    for (const key of Object.values(NO_SMS_MESSAGE_KEY)) {
      expect(strings[key].length).toBeGreaterThan(20);
    }
  });
});
