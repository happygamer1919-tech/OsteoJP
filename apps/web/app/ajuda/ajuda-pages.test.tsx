/**
 * G1-3: SUPORTE E GUIA, RENDERED PER ROLE. The three /ajuda pages are rendered
 * here as each staff role, with only the request context stubbed, and the
 * assertions read the HTML a viewer would get.
 *
 * WHAT IS PINNED WHERE. The ORDER of each role's lessons is written out by hand
 * in lib/guide/guide-roles.test.ts, against the helper. This file proves the
 * PAGES draw exactly that list: every lesson link on the index, in order, is
 * the helper's list for that role, the counts are the ruled ones (36, 37, 47,
 * 56), the section order per role is written out by hand below, and the named
 * cases the owner's spec asks for are asserted by id.
 *
 * NOT FOUND IS A THROW. notFound() and redirect() throw in Next, and they are
 * stubbed to throw here too, so a page that went on to render after them
 * would fail the "rejects" assertions.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Role } from "@osteojp/auth";
import { getStrings } from "@osteojp/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  ctx: null as null | { tenantId: string; role: string; userId: string },
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
vi.mock("@/lib/auth/context", () => ({
  getRequestContext: async () => h.ctx,
}));

import { GUIDE_DATA, guideLessonsFor, type GuideLesson } from "@/lib/guide/guide";
import { lessonHref, lessonSlug } from "@/lib/guide/guide-routes";

import AjudaLicaoPage, { metadata as licaoMetadata } from "./[seccao]/[licao]/page";
import AjudaSeccaoPage, { metadata as seccaoMetadata } from "./[seccao]/page";
import { GuideBody } from "./guide-blocks";
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

const hrefs = (lessons: GuideLesson[]) => lessons.map(lessonHref);
const lessonById = (id: string) => {
  const lesson = GUIDE_DATA.lessons.find((l) => l.id === id);
  if (!lesson) throw new Error(`no lesson ${id} in guide-data.json`);
  return lesson;
};

beforeEach(() => {
  as(null);
});

describe("the index lists exactly the viewer's lessons, in the viewer's order (G1-3, one test per role)", () => {
  it("reception: its 36 lessons in order, and nothing from Registos", async () => {
    const html = await indexHtml("reception");
    expect(lessonLinks(html)).toEqual(hrefs(guideLessonsFor("reception")));
    expect(lessonLinks(html)).toHaveLength(36);
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
    expect(html).not.toContain("/ajuda/registos");
    expect(html).not.toContain(">Registos<");
    // Receção opens its guide with Início, then Agenda's first lesson for it: Marcar uma consulta.
    expect(lessonLinks(html)[5]).toBe("/ajuda/agenda/marcar-consulta");
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
    expect(lessonLinks(html)).not.toContain("/ajuda/faturacao/faturas-de-um-periodo");
    expect(html).not.toContain("/ajuda/marcacao-online");
  });

  it("admin: the 47 Proprietário lessons whose capability the admin role holds, and no Registos", async () => {
    const html = await indexHtml("admin");
    expect(lessonLinks(html)).toEqual(hrefs(guideLessonsFor("admin")));
    expect(lessonLinks(html)).toHaveLength(47);
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
    expect(lessonLinks(html)).not.toContain("/ajuda/pacientes/pacientes-eliminados");
    expect(lessonLinks(html)).not.toContain("/ajuda/pacientes/atualizar-dados-e-terapeutas");
    expect(lessonLinks(html)).not.toContain("/ajuda/portal/mensagem-de-teste");
  });

  it("owner: every published lesson (56), in the Proprietário order, and not the held one", async () => {
    const html = await indexHtml("owner");
    expect(lessonLinks(html)).toEqual(hrefs(guideLessonsFor("owner")));
    expect(lessonLinks(html)).toHaveLength(56);
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
  });
});

describe("Perguntas frequentes (G1-2): empty until its own PR writes the entries", () => {
  it("?tab=perguntas shows the empty state and no lesson, for every role", async () => {
    expect(GUIDE_DATA.faq).toEqual([]);
    for (const role of ROLES) {
      const html = await indexHtml(role, "perguntas");
      expect(html, role).toContain(pt["guide.faqEmptyTitle"]);
      expect(html, role).toMatch(/role="tab" aria-selected="true"[^>]*>Perguntas frequentes</);
      expect(lessonLinks(html), role).toEqual([]);
    }
  });

  it("an unknown ?tab= opens the guide", async () => {
    const html = await indexHtml("owner", "outra");
    expect(lessonLinks(html)).toHaveLength(56);
    expect(html).not.toContain(pt["guide.faqEmptyTitle"]);
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
    await expect(lessonHtml("reception", "registos", "criar-registo")).rejects.toThrow("NOT_FOUND");
  });

  it("a therapist opening F1 (faturas de um período) is not found, and F2 renders", async () => {
    await expect(lessonHtml("therapist", "faturacao", "faturas-de-um-periodo")).rejects.toThrow("NOT_FOUND");
    const html = await lessonHtml("therapist", "faturacao", "faturas-de-um-paciente");
    expect(html).toContain(lessonById("faturacao.faturas-de-um-paciente").title);
  });

  it("admin opening a lesson whose capability it lacks is not found", async () => {
    await expect(lessonHtml("admin", "registos", "assinar-registo")).rejects.toThrow("NOT_FOUND");
    await expect(lessonHtml("admin", "pacientes", "pacientes-eliminados")).rejects.toThrow("NOT_FOUND");
    // The owner reads both.
    await expect(lessonHtml("owner", "registos", "assinar-registo")).resolves.toContain("<h1");
    await expect(lessonHtml("owner", "pacientes", "pacientes-eliminados")).resolves.toContain("<h1");
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
  const seeded = (over: Partial<GuideLesson>): Pick<GuideLesson, "title" | "images" | "blocks"> => ({
    title: "Uma lição de exemplo",
    images: null,
    blocks: [{ type: "para", spans: [{ text: "Clique em " }, { strong: "Guardar" }, { text: "." }] }],
    ...over,
  });
  const render = (lesson: Pick<GuideLesson, "title" | "images" | "blocks">, profile: "rececao" | "terapeuta" | "proprietario" = "rececao") =>
    renderToStaticMarkup(<GuideBody lesson={lesson} profile={profile} />);

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

  it("a role block is drawn only for its roles", () => {
    const lesson = seeded({
      blocks: [{ type: "role", roles: ["terapeuta", "proprietario"], blocks: [{ type: "para", spans: [{ text: "Só para alguns." }] }] }],
    });
    expect(render(lesson, "terapeuta")).toContain("Só para alguns.");
    expect(render(lesson, "proprietario")).toContain("Só para alguns.");
    expect(render(lesson, "rececao")).not.toContain("Só para alguns.");
  });
});
