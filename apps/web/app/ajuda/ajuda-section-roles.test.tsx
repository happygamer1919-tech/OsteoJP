/**
 * G1-3: A SECTION PAGE SHOWS EACH ROLE ONLY ITS OWN SECTION TEXT.
 *
 * No section of the guide carries a role block today, so the real data cannot
 * prove this: every role would read the same text whether it was filtered or
 * not. This file serves the pages a copy of guide-data.json whose Início
 * section gains four role blocks (invented text), renders /ajuda/inicio as each
 * staff role, and reads the HTML.
 *
 * The lessons are held the same way on real data by ajuda-pages.test.tsx
 * (inicio.resumo-do-dia carries four role blocks).
 */
import type { Role } from "@osteojp/auth";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { GuideBlock, GuideData } from "@/lib/guide/guide";

// vi.mock factories are hoisted above every import and const, so what they
// use is hoisted with them.
const h = vi.hoisted(() => ({
  ctx: null as null | { tenantId: string; role: string; userId: string },
  // One sentence per role block, each invented.
  RECECAO: "Frase de exemplo só para a receção.",
  TERAPEUTA: "Frase de exemplo só para o terapeuta.",
  PROPRIETARIO: "Frase de exemplo só para o proprietário.",
  RECECAO_E_TERAPEUTA: "Frase de exemplo para a receção e o terapeuta.",
  EVERYONE: "Frase de exemplo para todas as funções.",
}));
const { RECECAO, TERAPEUTA, PROPRIETARIO, RECECAO_E_TERAPEUTA, EVERYONE } = h;

vi.mock("@/lib/guide/guide-data.json", async (importOriginal) => {
  const para = (text: string): GuideBlock => ({ type: "para", spans: [{ text }] });
  const { RECECAO, TERAPEUTA, PROPRIETARIO, RECECAO_E_TERAPEUTA, EVERYONE } = h;
  const real = (await importOriginal<{ default: GuideData }>()).default;
  const data = structuredClone(real);
  const inicio = data.sections.find((section) => section.id === "inicio");
  if (!inicio) throw new Error("no inicio section in guide-data.json");
  inicio.blocks.push(
    para(EVERYONE),
    { type: "role", roles: ["rececao"], blocks: [para(RECECAO)] },
    { type: "role", roles: ["terapeuta"], blocks: [para(TERAPEUTA)] },
    { type: "role", roles: ["proprietario"], blocks: [para(PROPRIETARIO)] },
    { type: "role", roles: ["rececao", "terapeuta"], blocks: [para(RECECAO_E_TERAPEUTA)] },
  );
  return { default: data };
});
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/lib/auth/context", () => ({
  getRequestContext: async () => h.ctx,
}));

import { GUIDE_DATA } from "@/lib/guide/guide";

import AjudaSeccaoPage from "./[seccao]/page";

async function inicioAs(role: Role): Promise<string> {
  h.ctx = { tenantId: "tenant-exemplo", role, userId: `user-${role}` };
  return renderToStaticMarkup(await AjudaSeccaoPage({ params: Promise.resolve({ seccao: "inicio" }) }));
}

const ALL = [RECECAO, TERAPEUTA, PROPRIETARIO, RECECAO_E_TERAPEUTA];

/** What each role reads of the four role blocks. Admin reads the Proprietário guide. */
const READS: Record<Role, string[]> = {
  reception: [RECECAO, RECECAO_E_TERAPEUTA],
  therapist: [TERAPEUTA, RECECAO_E_TERAPEUTA],
  admin: [PROPRIETARIO],
  owner: [PROPRIETARIO],
};

describe("the seeded section reaches the pages", () => {
  it("the pages read the seeded copy, so the assertions below are not vacuous", () => {
    const text = JSON.stringify(GUIDE_DATA.sections.find((section) => section.id === "inicio")?.blocks);
    for (const sentence of [EVERYONE, ...ALL]) expect(text).toContain(sentence);
  });
});

describe("/ajuda/inicio draws only the viewer's role blocks (one test per role)", () => {
  for (const role of ["reception", "therapist", "admin", "owner"] as const) {
    it(role, async () => {
      const html = await inicioAs(role);
      expect(html).toContain(EVERYONE);
      for (const sentence of ALL) {
        if (READS[role].includes(sentence)) expect(html, sentence).toContain(sentence);
        else expect(html, sentence).not.toContain(sentence);
      }
    });
  }
});
