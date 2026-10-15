/**
 * page.test.tsx: SAT-01 (spec 7.3). THE SURVEY LIST'S PAGE: THAT IT IS NOT
 * THERE WHILE THE SURVEY IS SWITCHED OFF, AND WHAT IT DRAWS WHEN IT IS ON.
 *
 * The REAL page component renders here with its one data read replaced by a
 * stub. The switch is NOT stubbed: `lib/reminders/survey-mode.ts` and
 * `lib/nav/comms-sections.ts` are the real modules reading the real variable,
 * so what is pinned is the page's wiring to them:
 *   - SURVEY_SEND_MODE off, unset or any near-miss value: "not found", for
 *     every role and for nobody signed in, before the session is even asked
 *     for and before any row is read;
 *   - canary and on: the title, the subtitle, the month filter, the table and
 *     the tab, for every staff role; no send button;
 *   - an answer the viewer may not read draws the reserved sentence;
 *   - no sends: the approved empty text; no sends in a chosen month: text 86,
 *     not a false "none was ever sent"; admin or reception with no clinic
 *     assignment: text 87, and nobody else is ever told it.
 * Which rows each role is given is the database's, and is measured in
 * `lib/surveys/survey-list.db.test.ts`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SurveyListEntry } from "@/lib/surveys/survey-list-core";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  ctx: { tenantId: "11111111-1111-4111-8111-111111111111", role: "reception", userId: "22222222-2222-4222-8222-222222222222" } as {
    tenantId: string;
    role: string;
    userId: string;
  } | null,
  rows: [] as unknown[],
  sessionAsked: 0,
  reads: [] as Array<{ page?: number; month?: string | null }>,
  /** The viewer's own clinic assignments (staff_locations). */
  locations: ["33333333-3333-4333-8333-333333333333"] as string[],
  locationsAsked: 0,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/comunicacoes/avaliacoes-de-satisfacao",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth/context", () => ({
  getRequestContext: async () => {
    h.sessionAsked += 1;
    return h.ctx;
  },
}));
vi.mock("@/lib/auth/viewer-locations", () => ({
  resolveViewerLocationIds: async () => {
    h.locationsAsked += 1;
    return h.locations;
  },
}));
vi.mock("@/lib/surveys/survey-list", () => ({
  listSurveySends: async (_ctx: unknown, opts: { page?: number; month?: string | null }) => {
    h.reads.push(opts);
    return { rows: h.rows, total: h.rows.length, page: 1, pageSize: 50, pageCount: 1 };
  },
}));

import Page from "./page";

const TITLE = "Avaliações de satisfação";
const SUBTITLE =
  "Avaliações de satisfação enviadas depois de uma consulta concluída, com as respostas. Cada resposta é visível para o terapeuta que realizou a consulta, para a receção e os administradores da clínica onde decorreu e para o proprietário.";
const EMPTY = "Ainda não foi enviada nenhuma avaliação de satisfação.";
const EMPTY_HINT =
  "A avaliação de satisfação é enviada 24 horas depois de uma consulta concluída, se o paciente o permitir.";
/** Texts 86 and 87, written by strategy on 2026-10-14, pending the clinic's final yes. */
const EMPTY_MONTH = "Nenhuma avaliação enviada neste mês.";
const NO_CLINIC = "Sem clínica associada. Peça a um administrador para o associar a uma clínica.";
const RESERVED =
  "Resposta visível apenas para o terapeuta que realizou a consulta, para a receção e os administradores dessa clínica e para o proprietário.";

const entry = (over: Partial<SurveyListEntry> = {}): SurveyListEntry => ({
  sendId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  sentAt: new Date("2026-05-24T10:00:00Z"),
  channel: "email",
  origin: "automatic",
  outcome: null,
  senderName: null,
  patientId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  patientName: "Zzz Paciente Lista Teste",
  patientDeleted: false,
  visitStartsAt: new Date("2026-05-23T09:00:00Z"),
  therapistName: "Zzz Terapeuta Teste",
  clinicName: "Zzz Clinica Teste",
  answer: null,
  ...over,
});

async function render(searchParams: Record<string, string> = {}): Promise<string> {
  return renderToStaticMarkup(await Page({ searchParams: Promise.resolve(searchParams) }));
}
/** What the page did instead of rendering: the thrown navigation, by name. */
async function outcome(searchParams: Record<string, string> = {}): Promise<string> {
  try {
    await render(searchParams);
    return "RENDERED";
  } catch (e) {
    return e instanceof Error ? e.message : "unknown";
  }
}

const savedMode = process.env.SURVEY_SEND_MODE;

beforeEach(() => {
  h.ctx = { tenantId: "11111111-1111-4111-8111-111111111111", role: "reception", userId: "22222222-2222-4222-8222-222222222222" };
  h.rows = [entry()];
  h.sessionAsked = 0;
  h.reads = [];
  h.locations = ["33333333-3333-4333-8333-333333333333"];
  h.locationsAsked = 0;
  process.env.SURVEY_SEND_MODE = "on";
});
afterEach(() => {
  if (savedMode === undefined) delete process.env.SURVEY_SEND_MODE;
  else process.env.SURVEY_SEND_MODE = savedMode;
});

describe("while the survey is switched off the address is not there", () => {
  it.each([undefined, "", "off", "ON", "On", " on", "on ", "Canary", "true", "1"])(
    "SURVEY_SEND_MODE=%j: not found for every role and for nobody signed in, with no session asked and no row read",
    async (mode) => {
      if (mode === undefined) delete process.env.SURVEY_SEND_MODE;
      else process.env.SURVEY_SEND_MODE = mode;
      for (const role of ["owner", "admin", "reception", "therapist"]) {
        h.ctx = { ...h.ctx!, role };
        expect(await outcome(), role).toBe("NOT_FOUND");
        expect(await outcome({ mes: "2026-05" }), role).toBe("NOT_FOUND");
      }
      h.ctx = null;
      // Not a redirect to the sign-in page, which would say the address exists.
      expect(await outcome()).toBe("NOT_FOUND");
      expect(h.sessionAsked).toBe(0);
      expect(h.reads).toEqual([]);
      expect(h.locationsAsked).toBe(0);

      // CONTROL: the same request with the survey on renders.
      process.env.SURVEY_SEND_MODE = "on";
      h.ctx = { tenantId: "11111111-1111-4111-8111-111111111111", role: "reception", userId: "22222222-2222-4222-8222-222222222222" };
      expect(await outcome()).toBe("RENDERED");
    },
  );
});

describe.each(["canary", "on"])("SURVEY_SEND_MODE=%s", (mode) => {
  beforeEach(() => {
    process.env.SURVEY_SEND_MODE = mode;
  });

  it.each(["owner", "admin", "reception", "therapist"])("%s gets the page: title, subtitle, month filter, the row and its tab", async (role) => {
    h.ctx = { ...h.ctx!, role };
    const html = await render();
    expect(html).toContain(`<h1 class="text-xl font-semibold text-v2-text-primary">${TITLE}</h1>`);
    expect(html).toContain(SUBTITLE);
    expect(html).toContain('type="month"');
    expect(html).toContain(">Mês<");
    expect(html).toContain("Zzz Paciente Lista Teste");
    expect(html).toContain("24/05/2026, automático");
    expect(html).toContain("Sem resposta");
    expect(html).toContain('href="/patients/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"');
    expect(html).toContain("Abrir ficha");
    // The tab bar carries the section, and marks it as the page being read.
    expect(html).toMatch(/<a aria-current="page"[^>]*href="\/comunicacoes\/avaliacoes-de-satisfacao"[^>]*>Avaliações de satisfação<\/a>|<a[^>]*href="\/comunicacoes\/avaliacoes-de-satisfacao"[^>]*aria-current="page"[^>]*>Avaliações de satisfação<\/a>/);
    // Every column heading of the copy file, in the spec's order.
    const headings = ["Consulta", "Paciente", "Terapeuta", "Clínica", "Envio", "Resposta", "Recomendação (0 a 10)", "Satisfação (1 a 5)", "Comentário", "Aceita contacto", "Enviado por", "Respondido em"];
    const at = headings.map((heading) => html.indexOf(`>${heading}</th>`));
    expect(at.every((i) => i > 0), JSON.stringify(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("there is no send button on the page", async () => {
    const html = await render();
    expect(html).not.toContain("Enviar avaliação");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<form");
  });

  it("nobody signed in is sent to the sign-in page", async () => {
    h.ctx = null;
    expect(await outcome()).toBe("REDIRECT /login");
    expect(h.reads).toEqual([]);
  });

  it("an answer the viewer may not read draws the reserved sentence and no answer", async () => {
    h.rows = [entry({ outcome: "answered", answer: null })];
    const html = await render();
    expect(html).toContain("Com resposta");
    expect(html).toContain(RESERVED);
    expect(html).toContain('data-testid="survey-answer-reserved"');
  });

  it("an answer the viewer reads draws its scores, comment and contact choice, and no reserved sentence", async () => {
    h.rows = [
      entry({
        outcome: "answered",
        answer: { nps: 9, rating: 4, comment: "Zzz comentario de teste", commentPurgedAt: null, contactConsent: true, submittedAt: new Date("2026-05-25T14:30:00Z") },
      }),
    ];
    const html = await render();
    expect(html).toContain("Zzz comentario de teste");
    expect(html).toContain("25/05/2026, 15:30");
    expect(html).toContain(">Sim<");
    expect(html).not.toContain(RESERVED);
  });

  it.each(["owner", "admin", "reception", "therapist"])(
    "no sends at all, %s with a clinic: the approved empty text and its hint, and no other sentence",
    async (role) => {
      h.ctx = { ...h.ctx!, role };
      h.rows = [];
      const html = await render();
      expect(html).toContain(EMPTY);
      expect(html).toContain(EMPTY_HINT);
      expect(html).not.toContain(EMPTY_MONTH);
      expect(html).not.toContain(NO_CLINIC);
    },
  );

  it.each(["owner", "admin", "reception", "therapist"])(
    "no sends in a chosen month, %s with a clinic: text 86, the headings, and NOT the sentence that none was ever sent",
    async (role) => {
      h.ctx = { ...h.ctx!, role };
      h.rows = [];
      const html = await render({ mes: "2026-05" });
      expect(html).toContain(EMPTY_MONTH);
      expect(html).not.toContain(EMPTY);
      expect(html).not.toContain(EMPTY_HINT);
      expect(html).not.toContain(NO_CLINIC);
      expect(html).toContain(">Consulta</th>");
      expect(html).toContain('value="2026-05"');
    },
  );

  it.each(["admin", "reception"])(
    "%s with no clinic assignment: text 87, with or without a month, and neither 54 nor 86",
    async (role) => {
      h.ctx = { ...h.ctx!, role };
      h.rows = [];
      h.locations = [];
      for (const query of [{}, { mes: "2026-05" }] as Array<Record<string, string>>) {
        const html = await render(query);
        const at = JSON.stringify(query);
        expect(html, at).toContain(NO_CLINIC);
        expect(html, at).not.toContain(EMPTY);
        expect(html, at).not.toContain(EMPTY_HINT);
        expect(html, at).not.toContain(EMPTY_MONTH);
      }
    },
  );

  it.each(["owner", "therapist"])(
    "%s with no clinic assignment is never told text 87: their reads do not follow a clinic",
    async (role) => {
      h.ctx = { ...h.ctx!, role };
      h.rows = [];
      h.locations = [];
      expect(await render()).toContain(EMPTY);
      expect(await render({ mes: "2026-05" })).toContain(EMPTY_MONTH);
      const html = (await render()) + (await render({ mes: "2026-05" }));
      expect(html).not.toContain(NO_CLINIC);
      expect(h.locationsAsked).toBe(0);
    },
  );

  it("rows are drawn whatever the assignments say, and the assignments are asked only for an empty list", async () => {
    h.ctx = { ...h.ctx!, role: "reception" };
    h.locations = [];
    const html = await render();
    expect(html).toContain("Zzz Paciente Lista Teste");
    expect(html).not.toContain(NO_CLINIC);
    expect(html).not.toContain(EMPTY);
    expect(h.locationsAsked).toBe(0);
  });

  it("the month and the page of the address reach the read; a value that is not a month does not", async () => {
    await render({ mes: "2026-05", page: "3" });
    await render({ mes: "2026-13" });
    await render({ mes: "abc", page: "-2" });
    expect(h.reads).toEqual([
      { page: 3, month: "2026-05" },
      { page: 1, month: null },
      { page: 1, month: null },
    ]);
  });
});
