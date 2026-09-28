/**
 * G1-3: SUPORTE E GUIA, RENDERED PER ROLE. The three /ajuda pages are rendered
 * here as each staff role, with only the request context stubbed, and the
 * assertions read the HTML a viewer would get.
 *
 * WHAT IS PINNED WHERE. The ORDER of each role's lessons is written out by hand
 * in lib/guide/guide-roles.test.ts, against the helper. This file proves the
 * PAGES draw exactly that list: every lesson link on the index, in order, is
 * the helper's list for that role, the counts are the ruled ones (reception
 * 37, therapist 37, admin 48, owner 57), the section order per role is written
 * out by hand below, and the named cases the owner's spec asks for are
 * asserted by id.
 *
 * AN ABSENCE PROVES SOMETHING ONLY FOR A LESSON THAT EXISTS. Every "this role
 * does not get lesson X" below first checks that X is a published lesson (the
 * owner opens it), so renaming or splitting X in the lesson source turns the
 * assertion red instead of leaving it true of nothing.
 *
 * NOT FOUND IS A THROW. notFound() and redirect() throw in Next, and they are
 * stubbed to throw here too, so a page that went on to render after them
 * would fail the "rejects" assertions.
 *
 * THE SESSION GOES THROUGH THE REAL HELPER. The pages call
 * requireRequestContext (lib/auth/context, OSTEOJP-WEB-8), and it runs here
 * unmocked: only Supabase's getClaims answer and Sentry are stubbed. So the
 * redirect to /login for a visitor with no session, and the Auth outage that
 * must NOT look like a logout, are both the helper's own behaviour on these
 * pages, not a stub's.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Role } from "@osteojp/auth";
import { getStrings } from "@osteojp/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  ctx: null as null | { tenantId: string; role: string; userId: string },
  /** When true, the Auth service is unreachable: getClaims rejects. */
  authDown: false,
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("server-only", () => ({}));
// The claims a verified token would carry for h.ctx, or no claims at all.
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getClaims: async () => {
        if (h.authDown) throw new Error("Auth de exemplo inacessível");
        if (!h.ctx) return { data: { claims: null }, error: null };
        return {
          data: { claims: { tenant_id: h.ctx.tenantId, user_role: h.ctx.role, sub: h.ctx.userId } },
          error: null,
        };
      },
    },
  }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: h.captureException, captureMessage: h.captureMessage }));

import { redirect } from "next/navigation";

import {
  GUIDE_DATA,
  guideFaqFor,
  guideLessonsFor,
  type GuideBlock,
  type GuideLesson,
  type GuideViewLesson,
} from "@/lib/guide/guide";
import { lessonHref, lessonSlug } from "@/lib/guide/guide-routes";

import AjudaLicaoPage, { metadata as licaoMetadata } from "./[seccao]/[licao]/page";
import AjudaSeccaoPage, { metadata as seccaoMetadata } from "./[seccao]/page";
import { GuideBody, GuideText } from "./guide-blocks";
import AjudaPage, { metadata as indexMetadata } from "./page";

const pt = getStrings("pt");
const ROLES: Role[] = ["reception", "therapist", "admin", "owner"];

function as(role: Role | null) {
  h.ctx = role === null ? null : { tenantId: "tenant-exemplo", role, userId: `user-${role}` };
}

async function indexHtml(role: Role, tab?: string): Promise<string> {
  as(role);
  const page = await AjudaPage({ searchParams: Promise.resolve(tab === undefined ? {} : { tab }) });
  return renderToStaticMarkup(page);
}

async function sectionHtml(role: Role, seccao: string): Promise<string> {
  as(role);
  return renderToStaticMarkup(await AjudaSeccaoPage({ params: Promise.resolve({ seccao }) }));
}

async function lessonHtml(role: Role, seccao: string, licao: string): Promise<string> {
  as(role);
  return renderToStaticMarkup(await AjudaLicaoPage({ params: Promise.resolve({ seccao, licao }) }));
}

/** Every lesson link on a page, in document order: /ajuda/<section>/<slug>. */
function lessonLinks(html: string): string[] {
  return [...html.matchAll(/href="(\/ajuda\/[a-z0-9-]+\/[a-z0-9-]+)"/g)].map((m) => m[1]!);
}

/** Every section heading link on the index, in order. */
function sectionLinks(html: string): string[] {
  return [...html.matchAll(/data-guide-section="([a-z0-9-]+)"/g)].map((m) => m[1]!);
}

/** The href of the link with rel="prev" or rel="next", or null when there is none. */
function relHref(html: string, rel: "prev" | "next"): string | null {
  const tags = [...html.matchAll(/<a [^>]*>/g)].map((m) => m[0]).filter((tag) => tag.includes(` rel="${rel}"`));
  if (tags.length === 0) return null;
  expect(tags, `one rel="${rel}" link`).toHaveLength(1);
  return tags[0]!.match(/ href="([^"]*)"/)?.[1] ?? null;
}

const hrefs = (lessons: Pick<GuideLesson, "id" | "section">[]) => lessons.map(lessonHref);
const lessonById = (id: string) => {
  const lesson = GUIDE_DATA.lessons.find((l) => l.id === id);
  if (!lesson) throw new Error(`no lesson ${id} in guide-data.json`);
  return lesson;
};

/** The address of every published lesson: what the owner's guide links. */
const PUBLISHED = new Set(hrefs(GUIDE_DATA.lessons));

/** `href` is a published lesson, and it is not among `links`. */
function absentButPublished(links: string[], href: string) {
  expect(PUBLISHED.has(href), `${href} is a published lesson`).toBe(true);
  expect(links).not.toContain(href);
}

/** The lesson at /ajuda/<seccao>/<licao> renders for the owner, so it exists, and is not found for `role`. */
async function refusedButReal(role: Role, seccao: string, licao: string) {
  await expect(lessonHtml("owner", seccao, licao), `the owner opens ${seccao}/${licao}`).resolves.toContain("<h1");
  await expect(lessonHtml(role, seccao, licao), `${role} opens ${seccao}/${licao}`).rejects.toThrow("NOT_FOUND");
}

/** The heading levels on a page, in document order. */
function headingLevels(html: string): number[] {
  return [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
}

/** What is wrong with a page's heading outline: it must open with its one h1 and never skip a level going down. */
function headingProblems(html: string): string[] {
  const levels = headingLevels(html);
  const out: string[] = [];
  if (levels[0] !== 1) out.push(`opens with h${levels[0]}`);
  if (levels.filter((level) => level === 1).length !== 1) out.push("has not exactly one h1");
  for (let i = 1; i < levels.length; i++) {
    if (levels[i]! > levels[i - 1]! + 1) out.push(`h${levels[i - 1]} then h${levels[i]}`);
  }
  return out;
}

beforeEach(() => {
  as(null);
  h.authDown = false;
  vi.mocked(redirect).mockClear();
  h.captureException.mockClear();
  h.captureMessage.mockClear();
});

describe("the index lists exactly the viewer's lessons, in the viewer's order (G1-3, one test per role)", () => {
  it("reception: its 37 lessons in order, and nothing from Registos", async () => {
    const html = await indexHtml("reception");
    expect(lessonLinks(html)).toEqual(hrefs(guideLessonsFor("reception")));
    expect(lessonLinks(html)).toHaveLength(37);
    expect(sectionLinks(html)).toEqual([
      "inicio",
      "agenda",
      "pacientes",
      "pacotes",
      "marcacao-online",
      "portal",
      "faturacao",
      "equipa-e-horarios",
    ]);
    expect(GUIDE_DATA.sections.map((section) => section.id)).toContain("registos");
    expect(html).not.toContain("/ajuda/registos");
    expect(html).not.toContain(">Registos<");
    // Receção opens its guide with Início, then Agenda's first lesson for it: Marcar uma consulta.
    expect(lessonLinks(html)[5]).toBe("/ajuda/agenda/marcar-consulta");
    // Both halves of P4: reception holds patients:write and care_team:manage.
    expect(lessonLinks(html)).toContain("/ajuda/pacientes/atualizar-dados");
    expect(lessonLinks(html)).toContain("/ajuda/pacientes/atribuir-terapeutas");
  });

  it("therapist: its 37 lessons in order, with F2 (faturas de um paciente) and not F1 (faturas de um período)", async () => {
    const html = await indexHtml("therapist");
    expect(lessonLinks(html)).toEqual(hrefs(guideLessonsFor("therapist")));
    expect(lessonLinks(html)).toHaveLength(37);
    expect(sectionLinks(html)).toEqual([
      "inicio",
      "agenda",
      "registos",
      "pacientes",
      "pacotes",
      "equipa-e-horarios",
      "portal",
      "faturacao",
    ]);
    expect(lessonLinks(html)).toContain("/ajuda/faturacao/faturas-de-um-paciente");
    absentButPublished(lessonLinks(html), "/ajuda/faturacao/faturas-de-um-periodo");
    expect(html).not.toContain("/ajuda/marcacao-online");
    // Neither half of P4 is written for the Terapeuta guide.
    absentButPublished(lessonLinks(html), "/ajuda/pacientes/atualizar-dados");
    absentButPublished(lessonLinks(html), "/ajuda/pacientes/atribuir-terapeutas");
  });

  it("admin: the 48 Proprietário lessons whose capability the admin role holds, and no Registos", async () => {
    const html = await indexHtml("admin");
    expect(lessonLinks(html)).toEqual(hrefs(guideLessonsFor("admin")));
    expect(lessonLinks(html)).toHaveLength(48);
    expect(sectionLinks(html)).toEqual([
      "inicio",
      "agenda",
      "pacientes",
      "equipa-e-horarios",
      "faturacao",
      "pacotes",
      "portal",
      "marcacao-online",
    ]);
    expect(html).not.toContain("/ajuda/registos");
    absentButPublished(lessonLinks(html), "/ajuda/pacientes/pacientes-eliminados");
    absentButPublished(lessonLinks(html), "/ajuda/portal/mensagem-de-teste");
    // P4 split in two: admin holds patients:write and reads Atualizar os dados,
    // and lacks care_team:manage, so it does not get Atribuir terapeutas.
    expect(lessonLinks(html)).toContain("/ajuda/pacientes/atualizar-dados");
    absentButPublished(lessonLinks(html), "/ajuda/pacientes/atribuir-terapeutas");
  });

  it("owner: every published lesson (57), in the Proprietário order, and not the held one", async () => {
    const html = await indexHtml("owner");
    expect(lessonLinks(html)).toEqual(hrefs(guideLessonsFor("owner")));
    expect(lessonLinks(html)).toHaveLength(57);
    expect([...lessonLinks(html)].sort()).toEqual(hrefs(GUIDE_DATA.lessons).sort());
    expect(sectionLinks(html)).toEqual([
      "inicio",
      "agenda",
      "pacientes",
      "equipa-e-horarios",
      "faturacao",
      "pacotes",
      "portal",
      "marcacao-online",
      "registos",
    ]);
    expect(html).not.toContain("pedido-de-cliente-novo");
  });

  it("an absence is asserted only of a published lesson: the pre-split P4 address now fails the helpers", async () => {
    // P4 was one lesson, pacientes.atualizar-dados-e-terapeutas, until PR 1
    // split it. A bare not.toContain of its address stayed true of nothing.
    const gone = "/ajuda/pacientes/atualizar-dados-e-terapeutas";
    expect(PUBLISHED.has(gone)).toBe(false);
    expect(() => absentButPublished([], gone)).toThrow();
    await expect(refusedButReal("admin", "pacientes", "atualizar-dados-e-terapeutas")).rejects.toThrow();
  });

  it("each lesson link appears once on the index", async () => {
    for (const role of ROLES) {
      const links = lessonLinks(await indexHtml(role));
      expect(new Set(links).size, role).toBe(links.length);
    }
  });
});

describe("the page itself (G1-1)", () => {
  it("is titled Suporte e Guia on every /ajuda address", () => {
    expect(pt["guide.title"]).toBe("Suporte e Guia");
    expect(indexMetadata.title).toBe("Suporte e Guia");
    expect(seccaoMetadata.title).toBe("Suporte e Guia");
    expect(licaoMetadata.title).toBe("Suporte e Guia");
  });

  it("has the h1 Suporte e Guia and the two tabs, Guia da plataforma selected by default", async () => {
    const html = await indexHtml("reception");
    expect(html).toContain(`<h1 class="text-xl font-semibold text-v2-text-primary">Suporte e Guia</h1>`);
    expect(html).toMatch(/role="tab" aria-selected="true"[^>]*>Guia da plataforma</);
    expect(html).toMatch(/role="tab" aria-selected="false"[^>]*>Perguntas frequentes</);
  });

  it("sits inside the staff shell: its layout renders AppShell", () => {
    const layout = readFileSync(join(__dirname, "layout.tsx"), "utf8");
    expect(layout).toMatch(/import \{ AppShell \} from "@\/components\/app-shell";/);
    expect(layout).toMatch(/<AppShell>\{children\}<\/AppShell>/);
  });

  it("sends a visitor with no session to /login, from all three pages", async () => {
    as(null);
    await expect(AjudaPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT /login");
    await expect(AjudaSeccaoPage({ params: Promise.resolve({ seccao: "agenda" }) })).rejects.toThrow("REDIRECT /login");
    await expect(
      AjudaLicaoPage({ params: Promise.resolve({ seccao: "agenda", licao: "marcar-consulta" }) }),
    ).rejects.toThrow("REDIRECT /login");
    // An ordinary logout is not an incident: nothing reaches Sentry.
    expect(h.captureException).not.toHaveBeenCalled();
  });

  it("an Auth outage is reported to Sentry and fails the render, it never passes for a logout (OSTEOJP-WEB-8)", async () => {
    as("owner");
    h.authDown = true;
    await expect(AjudaPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("AUTH_UNAVAILABLE");
    await expect(AjudaSeccaoPage({ params: Promise.resolve({ seccao: "agenda" }) })).rejects.toThrow("AUTH_UNAVAILABLE");
    await expect(
      AjudaLicaoPage({ params: Promise.resolve({ seccao: "agenda", licao: "marcar-consulta" }) }),
    ).rejects.toThrow("AUTH_UNAVAILABLE");
    expect(redirect).not.toHaveBeenCalled();
    expect(h.captureException).toHaveBeenCalledTimes(3);
  });
});

/** Every FAQ entry on the Perguntas frequentes tab, in document order. */
function faqEntries(html: string): string[] {
  return [...html.matchAll(/data-guide-faq="([a-z0-9.-]+)"/g)].map((m) => m[1]!);
}

/** The HTML of one FAQ entry: from its article to the next one (or the end). */
function faqEntryHtml(html: string, id: string): string {
  const start = html.indexOf(`data-guide-faq="${id}"`);
  expect(start, `${id} is on the page`).toBeGreaterThan(-1);
  const next = html.indexOf("data-guide-faq=", start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

/** The lesson links of one FAQ entry, in order, as lesson ids. */
function faqLinks(html: string, id: string): string[] {
  return [...faqEntryHtml(html, id).matchAll(/data-guide-faq-lesson="([a-z0-9.-]+)"/g)].map((m) => m[1]!);
}

describe("Perguntas frequentes (G1-2): the seven base tasks first, for the viewer's role (one test per role)", () => {
  const SEVEN = [
    "perguntas.marcar-consulta",
    "perguntas.marcar-em-lote",
    "perguntas.adicionar-paciente",
    "perguntas.atribuir-pacote",
    "perguntas.bloquear-horario",
    "perguntas.concluir-consulta",
    "perguntas.assinar-registo",
  ];
  const SIX = SEVEN.slice(0, 6);

  it("the seven are the published entries, in file order", () => {
    expect(GUIDE_DATA.faq.map((entry) => entry.id)).toEqual(SEVEN);
  });

  it("reception: six entries in order, no Assinar registo, each with its lessons, and no Registos link", async () => {
    const html = await indexHtml("reception", "perguntas");
    expect(html).toMatch(/role="tab" aria-selected="true"[^>]*>Perguntas frequentes</);
    expect(faqEntries(html)).toEqual(SIX);
    expect(faqEntries(html)).not.toContain("perguntas.assinar-registo");
    expect(html).not.toContain("Como assino um registo?");
    expect(html).not.toContain("/ajuda/registos");
    for (const entry of guideFaqFor("reception")) {
      expect(faqLinks(html, entry.id), entry.id).toEqual(entry.lessons.map((lesson) => lesson.id));
    }
    expect(faqLinks(html, "perguntas.concluir-consulta")).toEqual(["agenda.registar-o-estado", "pacientes.marcacoes-na-ficha"]);
  });

  it("therapist: all seven, Concluir consulta links the registo lesson, Adicionar paciente links no Marcação online lesson", async () => {
    const html = await indexHtml("therapist", "perguntas");
    expect(faqEntries(html)).toEqual(SEVEN);
    for (const entry of guideFaqFor("therapist")) {
      expect(faqLinks(html, entry.id), entry.id).toEqual(entry.lessons.map((lesson) => lesson.id));
    }
    expect(faqLinks(html, "perguntas.concluir-consulta")).toContain("registos.criar-registo");
    expect(faqLinks(html, "perguntas.adicionar-paciente")).toEqual(["pacientes.registar-paciente", "pacientes.encontrar-paciente"]);
    expect(html).not.toContain("/ajuda/marcacao-online");
  });

  it("admin: six entries, no Assinar registo, and no Registos link", async () => {
    const html = await indexHtml("admin", "perguntas");
    expect(faqEntries(html)).toEqual(SIX);
    for (const entry of guideFaqFor("admin")) {
      expect(faqLinks(html, entry.id), entry.id).toEqual(entry.lessons.map((lesson) => lesson.id));
    }
    expect(html).not.toContain("/ajuda/registos");
  });

  it("owner: all seven, each with every lesson it names", async () => {
    const html = await indexHtml("owner", "perguntas");
    expect(faqEntries(html)).toEqual(SEVEN);
    for (const entry of GUIDE_DATA.faq) expect(faqLinks(html, entry.id), entry.id).toEqual(entry.see);
  });

  it("every lesson link on the tab opens, for the role that sees it", async () => {
    let opened = 0;
    for (const role of ROLES) {
      const html = await indexHtml(role, "perguntas");
      for (const href of lessonLinks(html)) {
        const [, , seccao, licao] = href.split("/");
        await expect(lessonHtml(role, seccao!, licao!), `${role} ${href}`).resolves.toContain("<h1");
        opened += 1;
      }
    }
    expect(opened).toBeGreaterThan(0);
  });

  it("each entry is its question, its answer for the role, and the Sem imagem card while its primary lesson has no capture", async () => {
    for (const role of ROLES) {
      const html = await indexHtml(role, "perguntas");
      for (const entry of guideFaqFor(role)) {
        const part = faqEntryHtml(html, entry.id);
        expect(part, `${role} ${entry.id}`).toContain(`>${entry.question}</h2>`);
        expect(entry.images, entry.id).toBeNull();
        expect(part, `${role} ${entry.id}`).toContain("data-guide-no-image");
        expect(part, `${role} ${entry.id}`).not.toContain("<img");
      }
      expect(html).toContain(`id="pergunta-marcar-consulta"`);
    }
  });

  it("an answer shows each role only its own role blocks", async () => {
    // Concluir consulta: Corrigir estado is for reception and the owner (it
    // needs appointments:delete); the registo line is for the therapist.
    const CORRIGIR = "Corrigir estado";
    const REGISTO = "Nova ficha clínica";
    const part = async (role: Role) => faqEntryHtml(await indexHtml(role, "perguntas"), "perguntas.concluir-consulta");
    expect(JSON.stringify(GUIDE_DATA.faq.find((e) => e.id === "perguntas.concluir-consulta")!.blocks)).toContain(CORRIGIR);
    expect(await part("reception")).toContain(CORRIGIR);
    expect(await part("reception")).not.toContain(REGISTO);
    expect(await part("therapist")).toContain(REGISTO);
    expect(await part("therapist")).not.toContain(CORRIGIR);
    expect(await part("owner")).toContain(CORRIGIR);
    expect(await part("owner")).not.toContain(REGISTO);
  });

  it("the guide tab shows no FAQ entry, and the FAQ tab no course", async () => {
    for (const role of ROLES) {
      expect(faqEntries(await indexHtml(role)), role).toEqual([]);
      expect(sectionLinks(await indexHtml(role, "perguntas")), role).toEqual([]);
    }
  });

  it("an unknown ?tab= opens the guide", async () => {
    const html = await indexHtml("owner", "outra");
    expect(lessonLinks(html)).toHaveLength(57);
    expect(faqEntries(html)).toEqual([]);
  });
});

describe("a section page lists the viewer's lessons there, and nothing outside the viewer's guide", () => {
  it("each role's section pages together list exactly its lessons, in order", async () => {
    for (const role of ROLES) {
      const expected = guideLessonsFor(role);
      const sections = [...new Set(expected.map((l) => l.section))];
      const links: string[] = [];
      for (const seccao of sections) links.push(...lessonLinks(await sectionHtml(role, seccao)));
      expect(links, role).toEqual(hrefs(expected));
    }
  });

  it("reception opening /ajuda/registos is not found", async () => {
    await expect(sectionHtml("reception", "registos")).rejects.toThrow("NOT_FOUND");
  });

  it("admin opening /ajuda/registos is not found (no Registos lesson is open to admin)", async () => {
    await expect(sectionHtml("admin", "registos")).rejects.toThrow("NOT_FOUND");
  });

  it("a therapist opening /ajuda/marcacao-online is not found", async () => {
    await expect(sectionHtml("therapist", "marcacao-online")).rejects.toThrow("NOT_FOUND");
  });

  it("an unknown section is not found", async () => {
    await expect(sectionHtml("owner", "nao-existe")).rejects.toThrow("NOT_FOUND");
  });
});

describe("a lesson page: the viewer's lessons only, else notFound()", () => {
  it("renders every lesson of each role, with its title as the h1", async () => {
    for (const role of ROLES) {
      for (const lesson of guideLessonsFor(role)) {
        const html = await lessonHtml(role, lesson.section, lessonSlug(lesson));
        expect(html, `${role} ${lesson.id}`).toContain(`<h1 class="text-xl font-semibold text-v2-text-primary">${lesson.title}</h1>`);
      }
    }
  });

  it("an unknown lesson, in a known and in an unknown section, is not found", async () => {
    await expect(lessonHtml("owner", "agenda", "nao-existe")).rejects.toThrow("NOT_FOUND");
    await expect(lessonHtml("owner", "nao-existe", "marcar-consulta")).rejects.toThrow("NOT_FOUND");
    // The right slug under the wrong section is not the lesson.
    await expect(lessonHtml("owner", "pacientes", "marcar-consulta")).rejects.toThrow("NOT_FOUND");
  });

  it("reception opening a Registos lesson is not found", async () => {
    await refusedButReal("reception", "registos", "criar-registo");
  });

  it("a therapist opening F1 (faturas de um período) is not found, and F2 renders", async () => {
    await refusedButReal("therapist", "faturacao", "faturas-de-um-periodo");
    const html = await lessonHtml("therapist", "faturacao", "faturas-de-um-paciente");
    expect(html).toContain(lessonById("faturacao.faturas-de-um-paciente").title);
  });

  it("a therapist opening either half of P4 is not found", async () => {
    await refusedButReal("therapist", "pacientes", "atualizar-dados");
    await refusedButReal("therapist", "pacientes", "atribuir-terapeutas");
  });

  it("admin opening a lesson whose capability it lacks is not found", async () => {
    await refusedButReal("admin", "registos", "assinar-registo");
    await refusedButReal("admin", "pacientes", "pacientes-eliminados");
    // care_team:manage: the admin role does not hold it, reception does.
    await refusedButReal("admin", "pacientes", "atribuir-terapeutas");
    await expect(lessonHtml("reception", "pacientes", "atribuir-terapeutas")).resolves.toContain("<h1");
    // patients:write: the other half of P4 is the admin's.
    await expect(lessonHtml("admin", "pacientes", "atualizar-dados")).resolves.toContain("<h1");
  });

  it("the held lesson (M1, GUEST-05) is not found, even for the owner", async () => {
    expect(GUIDE_DATA.held.map((item) => item.id)).toEqual(["marcacao-online.pedido-de-cliente-novo"]);
    for (const role of ROLES) {
      await expect(lessonHtml(role, "marcacao-online", "pedido-de-cliente-novo"), role).rejects.toThrow("NOT_FOUND");
    }
  });

  it("links the lesson before and after it in the role's course, across sections", async () => {
    const course = guideLessonsFor("reception");
    // The last Início lesson leads into Agenda.
    const lastInicio = course.findIndex((l) => l.id === "inicio.mudar-nome-ou-palavra-passe");
    const html = await lessonHtml("reception", "inicio", "mudar-nome-ou-palavra-passe");
    expect(relHref(html, "prev")).toBe(lessonHref(course[lastInicio - 1]!));
    expect(relHref(html, "next")).toBe(lessonHref(course[lastInicio + 1]!));
    expect(course[lastInicio + 1]!.id).toBe("agenda.marcar-consulta");
    // The first lesson has no previous one, the last has no next one.
    const first = await lessonHtml("reception", "inicio", "resumo-do-dia");
    expect(relHref(first, "prev")).toBeNull();
    expect(relHref(first, "next")).toBe(lessonHref(course[1]!));
    const last = course[course.length - 1]!;
    const end = await lessonHtml("reception", last.section, lessonSlug(last));
    expect(relHref(end, "next")).toBeNull();
    expect(relHref(end, "prev")).toBe(lessonHref(course[course.length - 2]!));
  });
});

describe("role blocks: each viewer reads only its own", () => {
  // inicio.resumo-do-dia carries four role blocks.
  const THERAPIST_AND_OWNER = "conta os registos clínicos criados esta semana";
  const RECEPTION_AND_OWNER = "soma as faturas emitidas e pagas no mês corrente";
  const OWNER_ONLY = "e só com mais de um local ativo";
  const THERAPIST_ONLY = "os números e as listas contam só as marcações em que participa";

  it("the four blocks are in the lesson, so the assertions below are not vacuous", () => {
    const text = JSON.stringify(lessonById("inicio.resumo-do-dia").blocks);
    for (const fragment of [THERAPIST_AND_OWNER, RECEPTION_AND_OWNER, OWNER_ONLY, THERAPIST_ONLY]) {
      expect(text).toContain(fragment);
    }
  });

  it("reception", async () => {
    const html = await lessonHtml("reception", "inicio", "resumo-do-dia");
    expect(html).toContain(RECEPTION_AND_OWNER);
    for (const hidden of [THERAPIST_AND_OWNER, OWNER_ONLY, THERAPIST_ONLY]) expect(html).not.toContain(hidden);
  });

  it("therapist", async () => {
    const html = await lessonHtml("therapist", "inicio", "resumo-do-dia");
    expect(html).toContain(THERAPIST_AND_OWNER);
    expect(html).toContain(THERAPIST_ONLY);
    for (const hidden of [RECEPTION_AND_OWNER, OWNER_ONLY]) expect(html).not.toContain(hidden);
  });

  it("owner and admin read the Proprietário blocks", async () => {
    for (const role of ["owner", "admin"] as const) {
      const html = await lessonHtml(role, "inicio", "resumo-do-dia");
      expect(html, role).toContain(THERAPIST_AND_OWNER);
      expect(html, role).toContain(RECEPTION_AND_OWNER);
      expect(html, role).toContain(OWNER_ONLY);
      expect(html, role).not.toContain(THERAPIST_ONLY);
    }
  });

  it("the text outside role blocks reaches every role", async () => {
    for (const role of ROLES) {
      expect(await lessonHtml(role, "inicio", "resumo-do-dia"), role).toContain("é a primeira página depois de entrar");
    }
  });
});

describe("the heading outline never skips a level", () => {
  it("the index, for every role: h1, then each section an h2, then each lesson an h3", async () => {
    for (const role of ROLES) {
      const guide = await indexHtml(role);
      expect(headingProblems(guide), role).toEqual([]);
      expect(headingLevels(guide).slice(0, 3), role).toEqual([1, 2, 3]);
    }
  });

  it("the Perguntas frequentes tab, for every role: the h1, then each question an h2", async () => {
    for (const role of ROLES) {
      const html = await indexHtml(role, "perguntas");
      expect(headingProblems(html), role).toEqual([]);
      expect(headingLevels(html), role).toEqual([1, ...guideFaqFor(role).map(() => 2)]);
    }
  });

  it("every section page of every role: the section title is the h1 and each lesson card an h2", async () => {
    for (const role of ROLES) {
      const course = guideLessonsFor(role);
      for (const seccao of new Set(course.map((lesson) => lesson.section))) {
        const html = await sectionHtml(role, seccao);
        const where = `${role} ${seccao}`;
        expect(headingProblems(html), where).toEqual([]);
        const cards = [...html.matchAll(/<h([1-6]) [^>]*><a [^>]*data-guide-lesson="([^"]+)"/g)];
        expect(cards.map((m) => m[2]), where).toEqual(course.filter((l) => l.section === seccao).map((l) => l.id));
        expect(new Set(cards.map((m) => m[1])), where).toEqual(new Set(["2"]));
      }
    }
  });

  it("every lesson page of every role", async () => {
    for (const role of ROLES) {
      for (const lesson of guideLessonsFor(role)) {
        expect(headingProblems(await lessonHtml(role, lesson.section, lessonSlug(lesson))), `${role} ${lesson.id}`).toEqual([]);
      }
    }
  });

  it("the check itself, on seeded markup", () => {
    expect(headingProblems("<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2>")).toEqual([]);
    expect(headingProblems("<h1>a</h1><h3>b</h3>")).toEqual(["h1 then h3"]);
    expect(headingProblems("<h2>a</h2>")).toEqual(["opens with h2", "has not exactly one h1"]);
    expect(headingProblems("<h1>a</h1><h1 class=\"x\">b</h1>")).toEqual(["has not exactly one h1"]);
  });
});

describe("a lesson without a capture shows Sem imagem, never a broken image (G1-7)", () => {
  it("every published lesson has no capture yet, and every one renders the Sem imagem card and no <img>", async () => {
    expect(GUIDE_DATA.lessons.every((lesson) => lesson.images === null)).toBe(true);
    for (const lesson of guideLessonsFor("owner")) {
      const html = await lessonHtml("owner", lesson.section, lessonSlug(lesson));
      expect(html, lesson.id).toContain("data-guide-no-image");
      expect(html, lesson.id).toContain(`>${pt["guide.noImage"]}<`);
      expect(html.toLowerCase(), lesson.id).toContain("sem imagem");
      expect(html, lesson.id).not.toContain("<img");
      expect(html, lesson.id).not.toContain("<picture");
    }
  });
});

describe("the lesson renderer (seeded lessons, invented text)", () => {
  const seeded = (over: Partial<GuideViewLesson>): Pick<GuideViewLesson, "title" | "images" | "blocks"> => ({
    title: "Uma lição de exemplo",
    images: null,
    blocks: [{ type: "para", spans: [{ text: "Clique em " }, { strong: "Guardar" }, { text: "." }] }],
    ...over,
  });
  const render = (lesson: Pick<GuideViewLesson, "title" | "images" | "blocks">) =>
    renderToStaticMarkup(<GuideBody lesson={lesson} />);

  const IMAGES = {
    phone: { src: "/ajuda/agenda/exemplo-390.png", alt: "Exemplo no telemóvel" },
    desktop: { src: "/ajuda/agenda/exemplo-desktop.png", alt: "Exemplo no computador" },
  };

  it("with a capture pair: a <picture>, the desktop capture from 768 px up, the phone capture below, and no Sem imagem", () => {
    const html = render(seeded({ images: IMAGES, blocks: [{ type: "para", spans: [{ text: "Antes." }] }, { type: "figure" }, { type: "para", spans: [{ text: "Depois." }] }] }));
    expect(html).toContain(`<source media="(min-width: 768px)" srcSet="/ajuda/agenda/exemplo-desktop.png"/>`);
    expect(html).toMatch(/<img src="\/ajuda\/agenda\/exemplo-390\.png" alt="Uma lição de exemplo"/);
    expect(html).not.toContain("data-guide-no-image");
    // The figure sits where the source put it, once.
    expect(html.indexOf("Antes.")).toBeLessThan(html.indexOf("<picture"));
    expect(html.indexOf("<picture")).toBeLessThan(html.indexOf("Depois."));
    expect(html.match(/<picture/g)).toHaveLength(1);
  });

  it("without a capture: the Sem imagem card, once, at the end", () => {
    const html = render(seeded({}));
    expect(html.match(/data-guide-no-image/g)).toHaveLength(1);
    expect(html.indexOf("Guardar")).toBeLessThan(html.indexOf("data-guide-no-image"));
    expect(html).not.toContain("<img");
  });

  it("text is escaped, never parsed as markup", () => {
    const html = render(seeded({ blocks: [{ type: "para", spans: [{ text: "<script>alert(1)</script>" }, { strong: "<b>x</b>" }] }] }));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("bold is <strong>; lists keep their kind and start; a ### heading is an h2", () => {
    const html = render(
      seeded({
        blocks: [
          { type: "heading", level: 3, spans: [{ text: "Passos" }] },
          { type: "list", kind: "ol", start: 3, items: [[{ text: "Um" }], [{ strong: "Dois" }]] },
          { type: "list", kind: "ul", start: 1, items: [[{ text: "Três" }]] },
        ],
      }),
    );
    expect(html).toMatch(/<h2 [^>]*>Passos<\/h2>/);
    expect(html).toMatch(/<ol start="3" [^>]*><li>Um<\/li><li><strong [^>]*>Dois<\/strong><\/li><\/ol>/);
    expect(html).toMatch(/<ul [^>]*><li>Três<\/li><\/ul>/);
  });

  it("takes resolved blocks only: raw blocks with a role block do not type-check, and the role block draws nothing", () => {
    // lib/guide resolves role blocks for the viewer before a page gets them
    // (blocksFor); ajuda-section-roles.test.tsx and the role block tests above
    // prove that per role. Here: the renderer cannot be handed the raw ones.
    const raw: GuideBlock[] = [
      { type: "para", spans: [{ text: "Para todos." }] },
      { type: "role", roles: ["rececao", "terapeuta", "proprietario"], blocks: [{ type: "para", spans: [{ text: "Só para alguns." }] }] },
    ];
    // @ts-expect-error raw blocks must go through blocksFor before a page draws them
    const text = renderToStaticMarkup(<GuideText blocks={raw} />);
    // @ts-expect-error the same for a lesson body
    const body = renderToStaticMarkup(<GuideBody lesson={{ title: "Uma lição de exemplo", images: null, blocks: raw }} />);
    for (const html of [text, body]) {
      expect(html).toContain("Para todos.");
      expect(html).not.toContain("Só para alguns.");
    }
  });
});
