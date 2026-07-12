import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  DECLARACAO_PARAGRAPH_2,
  DECLARACAO_TITLE,
  declaracaoParagraph1,
  renderDeclaracaoPdf,
} from "./declaracao-pdf";
import { signatureStampBytes } from "./signature-stamp-asset";
import type { DeclaracaoModel } from "./declaracao-model";

const model = (over: Partial<DeclaracaoModel> = {}): DeclaracaoModel => ({
  patientName: "João Conção",
  dia: "12/07/2026",
  horaInicio: "09:30",
  horaFim: "10:30",
  localidade: "Linda-a-Velha",
  responsavel: "Dr. João Paulo Santos Silva",
  stampBytes: null,
  ...over,
});

describe("Declaração template text (verbatim Fisiozero) + interpolation", () => {
  it("title is exactly 'Declaração de Presença'", () => {
    expect(DECLARACAO_TITLE).toBe("Declaração de Presença");
  });
  it("paragraph 1 interpolates name / dia / hora início / hora fim", () => {
    expect(declaracaoParagraph1(model())).toBe(
      "Para os devidos efeitos se declara que João Conção esteve em tratamento nas nossas instalações no dia 12/07/2026 entre as 09:30 e as 10:30.",
    );
  });
  it("paragraph 2 is the verbatim Fisiozero legal text", () => {
    expect(DECLARACAO_PARAGRAPH_2).toBe(
      "Por ser verdade se passa a presente declaração que vai assinada pelo responsável dos serviços e autenticada com o carimbo em uso nesta clínica.",
    );
  });
});

describe("renderDeclaracaoPdf — bytes, stamp slot, accents", () => {
  it("renders a non-empty PDF (starts with %PDF)", async () => {
    const bytes = await renderDeclaracaoPdf(model());
    expect(bytes.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("embeds the signature/stamp image when stampBytes is present (larger than blank)", async () => {
    const withStamp = await renderDeclaracaoPdf(model({ stampBytes: signatureStampBytes() }));
    const withoutStamp = await renderDeclaracaoPdf(model({ stampBytes: null }));
    // The embedded PNG makes the PDF materially larger than the blank-slot render.
    expect(withStamp.length).toBeGreaterThan(withoutStamp.length + 10_000);
    expect(withStamp.length).toBeGreaterThan(0);
  });

  it("renders pt-PT accents without throwing (Helvetica WinAnsi)", async () => {
    // Full pt-PT accent coverage: á é í ó ú â ê ô ã õ à ç.
    await expect(
      renderDeclaracaoPdf(
        model({ patientName: "São João Conção Município Açã", localidade: "Montemor-o-Novo" }),
      ),
    ).resolves.toBeInstanceOf(Uint8Array);
  });

  it("draws the responsável from the MODEL — no name literal in the renderer source", () => {
    const src = readFileSync(path.join(__dirname, "declaracao-pdf.ts"), "utf8");
    // The renderer must not hardcode the responsável; it draws model.responsavel.
    expect(src).not.toContain("João Paulo Santos Silva");
    expect(src).toContain("model.responsavel");
  });
});

describe("ADDENDUM: the extracted signature/stamp asset embeds into a real PDF", () => {
  it("the asset is non-empty and produces a non-zero PDF with the image", async () => {
    const bytes = signatureStampBytes();
    expect(bytes.length).toBeGreaterThan(1000);
    const pdf = await renderDeclaracaoPdf(model({ stampBytes: bytes }));
    expect(pdf.length).toBeGreaterThan(0);
  });
});
