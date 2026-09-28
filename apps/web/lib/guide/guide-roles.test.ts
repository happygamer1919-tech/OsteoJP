// G1-3: ROLE AWARE, PROVED BY A TEST PER ROLE. Each staff role reads its own
// lessons of Suporte e Guia, in its own order: reception the Receção guide, a
// therapist the Terapeuta guide, the owner every published lesson, and an
// admin the Proprietário lessons whose capability the admin role holds
// (owner ruling Q2 on the G1 proposal).
//
// The four lists below are written out by hand from the proposal's ruled
// orders (its "Order:" line per section and its section order per role), NOT
// read back from the code, so a lesson moved, added, dropped or given to the
// wrong role fails here by name. They read guide-data.json through the same
// helper /ajuda uses; guide-data.test.ts holds that file to the source.
//
// One change to the ruled list, from the first R4 review: the proposal's P4,
// "Atualizar dados e atribuir terapeutas", is two lessons, because its two
// halves have two gates. Correcting a patient's data needs patients:write,
// which an administrator holds; assigning a therapist needs care_team:manage,
// which it does not. As one lesson gated on care_team:manage, an administrator
// had no lesson on correcting a patient's data. Both halves keep P4's place
// and P4's roles: pacientes.atualizar-dados, then pacientes.atribuir-terapeutas.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PERMISSIONS, ROLES, can, type Capability, type Role } from "@osteojp/auth";
import { describe, expect, it } from "vitest";

import { loadGuide, PROFILES, REPO_ROOT } from "../../../../docs/guide/build/guide-model.mjs";

import {
  GUIDE_DATA,
  PROFILE_OF_ROLE,
  blocksFor,
  guideFaqFor,
  guideLessonsFor,
  guideSectionsFor,
  isCapability,
  type GuideBlock,
  type GuideData,
  type GuideSpan,
} from "./guide";

const ids = (role: Role) => guideLessonsFor(role).map((lesson) => lesson.id);
const sectionIds = (role: Role) => guideSectionsFor(role).map((entry) => entry.section.id);

// Receção: Início, Agenda, Pacientes, Pacotes, Marcação online, Portal do
// paciente, Faturação, Equipa e Horários. 38 lessons, M1 held: 37.
const RECEPTION = [
  "inicio.resumo-do-dia",
  "inicio.ver-outro-dia",
  "inicio.nota-rapida",
  "inicio.menu-e-sessao",
  "inicio.mudar-nome-ou-palavra-passe",
  "agenda.marcar-consulta",
  "agenda.ler-a-agenda",
  "agenda.registar-o-estado",
  "agenda.marcar-varias-sessoes",
  "agenda.bloquear-horario",
  "agenda.pedido-de-remarcacao",
  "agenda.encontrar-marcacoes",
  "agenda.nota-na-marcacao",
  "pacientes.encontrar-paciente",
  "pacientes.registar-paciente",
  "pacientes.marcacoes-na-ficha",
  "pacientes.atualizar-dados",
  "pacientes.atribuir-terapeutas",
  "pacientes.declaracao-e-documentos",
  "pacientes.recuperacao",
  "pacientes.ficha-do-paciente",
  "pacotes.atribuir-pacote",
  "pacotes.marcar-com-pacote",
  "pacotes.saldo-de-sessoes",
  "pacotes.associar-a-pacote",
  "marcacao-online.tratar-pedido-novo-cliente",
  "portal.confirmar-pedido-de-marcacao",
  "portal.alteracoes-dos-pacientes",
  "portal.lembretes-sms",
  "portal.pacientes-sem-sms",
  "portal.o-que-o-paciente-ve",
  "faturacao.faturas-de-um-periodo",
  "faturacao.faturas-de-um-paciente",
  "equipa-e-horarios.registar-ausencia",
  "equipa-e-horarios.inspetor-de-horarios",
  "equipa-e-horarios.horario-semanal",
  "equipa-e-horarios.semanas-alternadas-e-dia-a-dia",
];

// Terapeuta: Início, Agenda, Registos, Pacientes, Pacotes, Equipa e Horários,
// Portal do paciente, Faturação. 37 lessons.
const THERAPIST = [
  "inicio.resumo-do-dia",
  "inicio.nota-rapida",
  "inicio.ver-outro-dia",
  "inicio.menu-e-sessao",
  "inicio.mudar-nome-ou-palavra-passe",
  "agenda.ler-a-agenda",
  "agenda.registar-o-estado",
  "agenda.marcar-consulta",
  "agenda.bloquear-horario",
  "agenda.marcar-varias-sessoes",
  "agenda.encontrar-marcacoes",
  "agenda.nota-na-marcacao",
  "agenda.pedido-de-remarcacao",
  "registos.criar-registo",
  "registos.assinar-registo",
  "registos.revisao-consulta",
  "registos.gravar-consulta",
  "registos.episodios",
  "registos.gravacao-nao-processada",
  "pacientes.encontrar-paciente",
  "pacientes.ficha-do-paciente",
  "pacientes.marcacoes-na-ficha",
  "pacientes.declaracao-e-documentos",
  "pacientes.registar-paciente",
  "pacientes.recuperacao",
  "pacotes.marcar-com-pacote",
  "pacotes.atribuir-pacote",
  "pacotes.saldo-de-sessoes",
  "pacotes.associar-a-pacote",
  "equipa-e-horarios.registar-ausencia",
  "equipa-e-horarios.inspetor-de-horarios",
  "equipa-e-horarios.horario-semanal",
  "equipa-e-horarios.semanas-alternadas-e-dia-a-dia",
  "portal.alteracoes-dos-pacientes",
  "portal.pacientes-sem-sms",
  "portal.o-que-o-paciente-ve",
  "faturacao.faturas-de-um-paciente",
];

// Proprietário: Início, Agenda, Pacientes, Equipa e Horários, Faturação,
// Pacotes, Portal do paciente, Marcação online, Registos. 58 lessons, M1
// held: 57, which is every published lesson.
const OWNER = [
  "inicio.resumo-do-dia",
  "inicio.ver-outro-dia",
  "inicio.nota-rapida",
  "inicio.menu-e-sessao",
  "inicio.mudar-nome-ou-palavra-passe",
  "agenda.ler-a-agenda",
  "agenda.marcar-consulta",
  "agenda.registar-o-estado",
  "agenda.marcar-varias-sessoes",
  "agenda.bloquear-horario",
  "agenda.encontrar-marcacoes",
  "agenda.nota-na-marcacao",
  "agenda.pedido-de-remarcacao",
  "pacientes.encontrar-paciente",
  "pacientes.registar-paciente",
  "pacientes.ficha-do-paciente",
  "pacientes.atualizar-dados",
  "pacientes.atribuir-terapeutas",
  "pacientes.marcacoes-na-ficha",
  "pacientes.declaracao-e-documentos",
  "pacientes.recuperacao",
  "pacientes.juntar-ficha-duplicada",
  "pacientes.pacientes-eliminados",
  "equipa-e-horarios.inspetor-de-horarios",
  "equipa-e-horarios.horario-semanal",
  "equipa-e-horarios.semanas-alternadas-e-dia-a-dia",
  "equipa-e-horarios.registar-ausencia",
  "equipa-e-horarios.convidar-pessoa",
  "equipa-e-horarios.gerir-pessoa",
  "equipa-e-horarios.saida-da-clinica",
  "equipa-e-horarios.definicoes-da-clinica",
  "equipa-e-horarios.locais",
  "equipa-e-horarios.servicos-e-precos",
  "faturacao.faturas-de-um-periodo",
  "faturacao.estatisticas-painel",
  "faturacao.indicadores",
  "faturacao.faturas-de-um-paciente",
  "pacotes.criar-pacote",
  "pacotes.atribuir-pacote",
  "pacotes.marcar-com-pacote",
  "pacotes.saldo-de-sessoes",
  "pacotes.associar-a-pacote",
  "portal.o-que-o-paciente-ve",
  "portal.confirmar-pedido-de-marcacao",
  "portal.alteracoes-dos-pacientes",
  "portal.lembretes-sms",
  "portal.pacientes-sem-sms",
  "portal.servicos-no-portal",
  "portal.mensagem-de-teste",
  "marcacao-online.tratar-pedido-novo-cliente",
  "marcacao-online.horarios-do-portal",
  "registos.revisao-consulta",
  "registos.assinar-registo",
  "registos.criar-registo",
  "registos.gravar-consulta",
  "registos.episodios",
  "registos.gravacao-nao-processada",
];

// Administrador: the Proprietário order without the lessons whose capability
// the admin role lacks: Atribuir terapeutas a um paciente (care_team:manage),
// Recuperar um paciente eliminado (patients:recover), every Registos lesson
// (clinical_records:author, :sign, :review) and Enviar uma mensagem de teste
// (roles:manage; the page is owner only, see "a lesson's gate is its page's
// gate" below). 48 lessons.
const ADMIN = [
  "inicio.resumo-do-dia",
  "inicio.ver-outro-dia",
  "inicio.nota-rapida",
  "inicio.menu-e-sessao",
  "inicio.mudar-nome-ou-palavra-passe",
  "agenda.ler-a-agenda",
  "agenda.marcar-consulta",
  "agenda.registar-o-estado",
  "agenda.marcar-varias-sessoes",
  "agenda.bloquear-horario",
  "agenda.encontrar-marcacoes",
  "agenda.nota-na-marcacao",
  "agenda.pedido-de-remarcacao",
  "pacientes.encontrar-paciente",
  "pacientes.registar-paciente",
  "pacientes.ficha-do-paciente",
  "pacientes.atualizar-dados",
  "pacientes.marcacoes-na-ficha",
  "pacientes.declaracao-e-documentos",
  "pacientes.recuperacao",
  "pacientes.juntar-ficha-duplicada",
  "equipa-e-horarios.inspetor-de-horarios",
  "equipa-e-horarios.horario-semanal",
  "equipa-e-horarios.semanas-alternadas-e-dia-a-dia",
  "equipa-e-horarios.registar-ausencia",
  "equipa-e-horarios.convidar-pessoa",
  "equipa-e-horarios.gerir-pessoa",
  "equipa-e-horarios.saida-da-clinica",
  "equipa-e-horarios.definicoes-da-clinica",
  "equipa-e-horarios.locais",
  "equipa-e-horarios.servicos-e-precos",
  "faturacao.faturas-de-um-periodo",
  "faturacao.estatisticas-painel",
  "faturacao.indicadores",
  "faturacao.faturas-de-um-paciente",
  "pacotes.criar-pacote",
  "pacotes.atribuir-pacote",
  "pacotes.marcar-com-pacote",
  "pacotes.saldo-de-sessoes",
  "pacotes.associar-a-pacote",
  "portal.o-que-o-paciente-ve",
  "portal.confirmar-pedido-de-marcacao",
  "portal.alteracoes-dos-pacientes",
  "portal.lembretes-sms",
  "portal.pacientes-sem-sms",
  "portal.servicos-no-portal",
  "marcacao-online.tratar-pedido-novo-cliente",
  "marcacao-online.horarios-do-portal",
];

describe("each role sees exactly its own lessons, in its own order (G1-3)", () => {
  it("reception: the 37 Receção lessons, and no Registos lesson", () => {
    expect(ids("reception")).toEqual(RECEPTION);
    expect(ids("reception").filter((id) => id.startsWith("registos."))).toEqual([]);
    expect(sectionIds("reception")).not.toContain("registos");
  });

  it("therapist: the 37 Terapeuta lessons, with F2 (faturas de um paciente) and not F1 (faturas de um período)", () => {
    expect(ids("therapist")).toEqual(THERAPIST);
    expect(ids("therapist")).toContain("faturacao.faturas-de-um-paciente");
    expect(ids("therapist")).not.toContain("faturacao.faturas-de-um-periodo");
    expect(ids("therapist").filter((id) => id.startsWith("marcacao-online."))).toEqual([]);
  });

  it("admin: the 48 Proprietário lessons whose capability the admin role holds, with Atualizar os dados and without Atribuir terapeutas", () => {
    expect(ids("admin")).toEqual(ADMIN);
    // The same list, derived: the owner's lessons filtered by can("admin", capability).
    const derived = guideLessonsFor("owner")
      .filter((lesson) => lesson.capability === null || (isCapability(lesson.capability) && can("admin", lesson.capability)))
      .map((lesson) => lesson.id);
    expect(ids("admin")).toEqual(derived);
    expect(sectionIds("admin")).not.toContain("registos");
    expect(ids("admin")).toContain("pacientes.atualizar-dados");
    expect(ids("admin")).not.toContain("pacientes.atribuir-terapeutas");
  });

  it("owner: the 57 Proprietário lessons, which are every published lesson", () => {
    expect(ids("owner")).toEqual(OWNER);
    expect([...ids("owner")].sort()).toEqual(GUIDE_DATA.lessons.map((lesson) => lesson.id).sort());
  });
});

describe("the lists above are the ruled orders", () => {
  it("each role reads its sections in the ruled section order", () => {
    expect(sectionIds("reception")).toEqual([
      "inicio",
      "agenda",
      "pacientes",
      "pacotes",
      "marcacao-online",
      "portal",
      "faturacao",
      "equipa-e-horarios",
    ]);
    expect(sectionIds("therapist")).toEqual([
      "inicio",
      "agenda",
      "registos",
      "pacientes",
      "pacotes",
      "equipa-e-horarios",
      "portal",
      "faturacao",
    ]);
    expect(sectionIds("owner")).toEqual([
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
    expect(sectionIds("admin")).toEqual(sectionIds("owner").filter((id) => id !== "registos"));
  });

  it("the helper's order is the model's order for every profile (the JSON orders come from guide-model.mjs)", () => {
    for (const profile of PROFILES) {
      const role = (Object.keys(PROFILE_OF_ROLE) as Role[]).find((r) => PROFILE_OF_ROLE[r] === profile && r !== "admin");
      expect(role, `no role reads the ${profile} guide`).toBeDefined();
      expect(ids(role as Role)).toEqual(GUIDE_DATA.orders[profile].lessons);
    }
  });

  it("every staff role has a guide profile", () => {
    expect([...ROLES].sort()).toEqual(Object.keys(PROFILE_OF_ROLE).sort());
  });
});

describe("a lesson is only ever written for a role that can open its screen", () => {
  // Read from the source, so the held lesson (M1) is checked too.
  const guide = loadGuide();
  const all = [...guide.lessons, ...guide.faq];
  const roleOfProfile = { rececao: "reception", terapeuta: "therapist", proprietario: "owner" } as const;

  it("the source loads without errors", () => {
    expect(guide.errors).toEqual([]);
    // 58 lessons and the seven FAQ entries: an entry is held to the same rule.
    expect(all.length).toBe(65);
  });

  it("every capability named is a packages/auth capability", () => {
    const unknown = all.filter((l) => l.capability !== null && !isCapability(l.capability)).map((l) => `${l.id}: ${l.capability}`);
    expect(unknown).toEqual([]);
  });

  it("every role listed on a lesson holds the lesson's capability", () => {
    const offences: string[] = [];
    for (const lesson of all) {
      if (lesson.capability === null) continue;
      for (const profile of lesson.roles) {
        const role = roleOfProfile[profile];
        if (!isCapability(lesson.capability) || !PERMISSIONS[role].has(lesson.capability)) {
          offences.push(`${lesson.file}: ${role} does not hold ${lesson.capability}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  // The rule above proved both ways on a seeded case, through the same
  // helper: a Registos capability on a Receção lesson is hidden from
  // reception, and the same lesson with a capability reception holds is shown.
  it("seeded: a lesson naming a role without its capability stays hidden from that role", () => {
    const lesson = GUIDE_DATA.lessons.find((l) => l.id === "agenda.marcar-consulta");
    expect(lesson).toBeDefined();
    const withCapability = (capability: string) => ({
      ...GUIDE_DATA,
      lessons: [{ ...lesson!, capability }],
      orders: { ...GUIDE_DATA.orders, rececao: { ...GUIDE_DATA.orders.rececao, lessons: [lesson!.id] } },
    });
    expect(guideLessonsFor("reception", withCapability("clinical_records:author"))).toEqual([]);
    expect(guideLessonsFor("reception", withCapability("appointments:write")).map((l) => l.id)).toEqual([lesson!.id]);
  });

  it("the held lesson (M1, GUEST-05) is in no role's guide", () => {
    const held = GUIDE_DATA.held.map((item) => item.id);
    expect(held).toEqual(["marcacao-online.pedido-de-cliente-novo"]);
    for (const role of ROLES) expect(ids(role)).not.toContain(held[0]);
  });
});

// G1-2 AND G1-3 FOR PERGUNTAS FREQUENTES: each role reads its own FAQ
// entries, the seven base tasks in the order their "order" keys give, and each entry
// links only lessons that role reads, its primary lesson first. Written out by
// hand from the ruled proposal (its table "The seven FAQ entries": primary
// lesson, "also" lessons, roles), not read back from the code.
//
// Two "also" links are for some readers only, as the table says: Criar e
// preencher um registo clínico (G1) under Concluir consulta is "for T and P",
// and Tratar um pedido de novo cliente (M2) under Adicionar paciente needs
// guest_requests:read, which a therapist lacks. An administrator reads the
// Proprietário entries whose capability it holds: not Assinar registo
// (clinical_records:sign), and not the G1 link (clinical_records:author).

type FaqList = [entry: string, lessons: string[]][];

const faqOf = (role: Role): FaqList => guideFaqFor(role).map((entry) => [entry.id, entry.lessons.map((lesson) => lesson.id)]);

const MARCAR_CONSULTA: FaqList[number] = [
  "perguntas.marcar-consulta",
  ["agenda.marcar-consulta", "pacientes.marcacoes-na-ficha", "pacotes.marcar-com-pacote"],
];
const MARCAR_EM_LOTE: FaqList[number] = ["perguntas.marcar-em-lote", ["agenda.marcar-varias-sessoes", "pacotes.atribuir-pacote"]];
const ADICIONAR_PACIENTE_ONLINE: FaqList[number] = [
  "perguntas.adicionar-paciente",
  ["pacientes.registar-paciente", "pacientes.encontrar-paciente", "marcacao-online.tratar-pedido-novo-cliente"],
];
const ATRIBUIR_PACOTE: FaqList[number] = [
  "perguntas.atribuir-pacote",
  ["pacotes.atribuir-pacote", "pacotes.marcar-com-pacote", "pacotes.saldo-de-sessoes"],
];
const BLOQUEAR_HORARIO: FaqList[number] = [
  "perguntas.bloquear-horario",
  ["agenda.bloquear-horario", "equipa-e-horarios.registar-ausencia"],
];
const CONCLUIR_SEM_REGISTO: FaqList[number] = [
  "perguntas.concluir-consulta",
  ["agenda.registar-o-estado", "pacientes.marcacoes-na-ficha"],
];
const CONCLUIR_COM_REGISTO: FaqList[number] = [
  "perguntas.concluir-consulta",
  ["agenda.registar-o-estado", "pacientes.marcacoes-na-ficha", "registos.criar-registo"],
];
const ASSINAR_REGISTO: FaqList[number] = ["perguntas.assinar-registo", ["registos.assinar-registo", "registos.revisao-consulta"]];

const RECEPTION_FAQ: FaqList = [
  MARCAR_CONSULTA,
  MARCAR_EM_LOTE,
  ADICIONAR_PACIENTE_ONLINE,
  ATRIBUIR_PACOTE,
  BLOQUEAR_HORARIO,
  CONCLUIR_SEM_REGISTO,
];
const THERAPIST_FAQ: FaqList = [
  MARCAR_CONSULTA,
  MARCAR_EM_LOTE,
  ["perguntas.adicionar-paciente", ["pacientes.registar-paciente", "pacientes.encontrar-paciente"]],
  ATRIBUIR_PACOTE,
  BLOQUEAR_HORARIO,
  CONCLUIR_COM_REGISTO,
  ASSINAR_REGISTO,
];
const ADMIN_FAQ: FaqList = [
  MARCAR_CONSULTA,
  MARCAR_EM_LOTE,
  ADICIONAR_PACIENTE_ONLINE,
  ATRIBUIR_PACOTE,
  BLOQUEAR_HORARIO,
  CONCLUIR_SEM_REGISTO,
];
const OWNER_FAQ: FaqList = [
  MARCAR_CONSULTA,
  MARCAR_EM_LOTE,
  ADICIONAR_PACIENTE_ONLINE,
  ATRIBUIR_PACOTE,
  BLOQUEAR_HORARIO,
  CONCLUIR_COM_REGISTO,
  ASSINAR_REGISTO,
];

describe("each role reads exactly its own FAQ entries, the seven base tasks first, in the ruled order (G1-2, G1-3)", () => {
  it("reception: six entries, no Assinar registo, and no Registos link", () => {
    expect(faqOf("reception")).toEqual(RECEPTION_FAQ);
    expect(GUIDE_DATA.faq.map((entry) => entry.id)).toContain("perguntas.assinar-registo");
    expect(faqOf("reception").flatMap(([, lessons]) => lessons).filter((id) => id.startsWith("registos."))).toEqual([]);
  });

  it("therapist: all seven, with Criar e preencher um registo clínico under Concluir consulta and no Marcação online link", () => {
    expect(faqOf("therapist")).toEqual(THERAPIST_FAQ);
    expect(faqOf("therapist").flatMap(([, lessons]) => lessons).filter((id) => id.startsWith("marcacao-online."))).toEqual([]);
  });

  it("admin: the six Proprietário entries whose capability the admin role holds, each with the links it can open", () => {
    expect(faqOf("admin")).toEqual(ADMIN_FAQ);
    // The same list, derived: the owner's entries filtered by can("admin", capability).
    const derived = guideFaqFor("owner")
      .filter((entry) => entry.capability === null || (isCapability(entry.capability) && can("admin", entry.capability)))
      .map((entry) => entry.id);
    expect(faqOf("admin").map(([id]) => id)).toEqual(derived);
  });

  it("owner: all seven, every link of every entry", () => {
    expect(faqOf("owner")).toEqual(OWNER_FAQ);
    expect(faqOf("owner").map(([id]) => id)).toEqual(GUIDE_DATA.faq.map((entry) => entry.id));
    for (const [id, lessons] of faqOf("owner")) {
      expect(lessons, id).toEqual(GUIDE_DATA.faq.find((entry) => entry.id === id)!.see);
    }
  });

  // The order is worked out here from the FAQ files themselves: their "order"
  // keys, read by guide-model.mjs's loader and sorted in this test. It is not
  // GUIDE_DATA.orders, which is what the helper reads, nor the model's faqFor,
  // which wrote those orders.
  it("the helper's FAQ order is the order the files' order keys give, for every profile", () => {
    const source = loadGuide();
    expect(source.errors).toEqual([]);
    for (const profile of PROFILES) {
      const role = (Object.keys(PROFILE_OF_ROLE) as Role[]).find((r) => PROFILE_OF_ROLE[r] === profile && r !== "admin")!;
      const byOrderKey = source.faq
        .filter((entry) => entry.hold === null && entry.roles.includes(profile))
        .map((entry) => ({ id: entry.id, position: entry.order[profile]! }))
        .sort((a, b) => a.position - b.position)
        .map((entry) => entry.id);
      expect(byOrderKey.length, profile).toBeGreaterThan(0);
      expect(faqOf(role).map(([id]) => id), profile).toEqual(byOrderKey);
    }
  });
});

describe("every lesson an FAQ entry links is a published lesson the same role reads", () => {
  it("for every role: each link is in the role's own guide, the primary lesson is first, and no link the role reads is dropped", () => {
    const problems: string[] = [];
    let links = 0;
    for (const role of ROLES) {
      const readable = new Set(ids(role));
      for (const entry of guideFaqFor(role)) {
        const got = entry.lessons.map((lesson) => lesson.id);
        links += got.length;
        for (const id of got) if (!readable.has(id)) problems.push(`${role} ${entry.id}: links ${id}, outside its guide`);
        if (got[0] !== entry.see[0]) problems.push(`${role} ${entry.id}: the primary lesson ${entry.see[0]} is not its first link`);
        const want = entry.see.filter((id) => readable.has(id));
        if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${role} ${entry.id}: links ${got.join(" ")}, not ${want.join(" ")}`);
      }
    }
    expect(problems).toEqual([]);
    expect(links).toBeGreaterThan(0);
  });

  it("every see id of every entry is a published lesson, and reaches at least one role through the entry", () => {
    const published = new Set(GUIDE_DATA.lessons.map((lesson) => lesson.id));
    const reached = new Set(ROLES.flatMap((role) => guideFaqFor(role).flatMap((entry) => entry.lessons.map((l) => `${entry.id} ${l.id}`))));
    const problems: string[] = [];
    for (const entry of GUIDE_DATA.faq) {
      for (const id of entry.see) {
        if (!published.has(id)) problems.push(`${entry.id}: ${id} is not a published lesson`);
        if (!reached.has(`${entry.id} ${id}`)) problems.push(`${entry.id}: no role is shown ${id}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("seeded: a link to a lesson outside a role's guide is dropped for that role and kept for the role that reads it", () => {
    const base = GUIDE_DATA.faq.find((entry) => entry.id === "perguntas.marcar-consulta")!;
    const entry = { ...base, see: ["agenda.marcar-consulta", "registos.criar-registo"] };
    const data: GuideData = { ...GUIDE_DATA, faq: [entry] };
    const linksOf = (role: Role) => guideFaqFor(role, data).map((item) => item.lessons.map((lesson) => lesson.id));
    expect(linksOf("reception")).toEqual([["agenda.marcar-consulta"]]);
    expect(linksOf("therapist")).toEqual([["agenda.marcar-consulta", "registos.criar-registo"]]);
    expect(linksOf("admin")).toEqual([["agenda.marcar-consulta"]]);
  });
});

// G1-3 INSIDE A LESSON. A role block is text written for some profiles only;
// every lesson the helpers hand to /ajuda has its role blocks resolved for the
// viewer. Each role below reads, lesson by lesson, every role block that names
// its profile and no other (an administrator reads the Proprietário blocks),
// and no role block reaches the page unresolved.

const spanText = (spans: GuideSpan[]) => spans.map((span) => ("text" in span ? span.text : span.strong)).join("");

/** Every line of text in blocks, role blocks included, in order. */
function textOf(blocks: readonly GuideBlock[]): string[] {
  return blocks.flatMap((block): string[] => {
    if (block.type === "heading" || block.type === "para") return [spanText(block.spans)];
    if (block.type === "list") return block.items.map(spanText);
    if (block.type === "role") return textOf(block.blocks);
    return [];
  });
}

/**
 * Checks every lesson (or, with "faq", every FAQ entry) the role sees against
 * the source blocks in GUIDE_DATA. What the role reads must be, line for line
 * and in order, the shared text plus the role blocks that name its profile;
 * and a line of any other role block must not be there, unless the same
 * sentence is also written for this profile (Horários da equipa repeats one
 * step in two blocks). Returns the problems and how many role blocks were
 * read and withheld, so an empty problem list is never the result of there
 * being no role block to check.
 */
function roleBlockAudit(role: Role, kind: "lessons" | "faq" = "lessons"): { problems: string[]; read: number; withheld: number } {
  const profile = PROFILE_OF_ROLE[role];
  const problems: string[] = [];
  let read = 0;
  let withheld = 0;
  const source = new Map((kind === "lessons" ? GUIDE_DATA.lessons : GUIDE_DATA.faq).map((lesson) => [lesson.id, lesson]));
  for (const seen of kind === "lessons" ? guideLessonsFor(role) : guideFaqFor(role)) {
    const lesson = source.get(seen.id)!;
    if (seen.blocks.some((block) => (block as GuideBlock).type === "role")) problems.push(`${seen.id}: a role block reached the page`);
    const text = textOf(seen.blocks);
    const entitled = textOf(lesson.blocks.filter((block) => block.type !== "role" || block.roles.includes(profile)));
    if (JSON.stringify(text) !== JSON.stringify(entitled)) problems.push(`${seen.id}: reads other text than its shared text and its own blocks`);
    for (const block of lesson.blocks) {
      if (block.type !== "role") continue;
      const mine = block.roles.includes(profile);
      if (mine) read += 1;
      else withheld += 1;
      for (const line of textOf(block.blocks)) {
        if (mine && !text.includes(line)) problems.push(`${seen.id}: misses "${line}", written for ${block.roles.join(" ")}`);
        if (!mine && text.includes(line) && !entitled.includes(line)) {
          problems.push(`${seen.id}: shows "${line}", written for ${block.roles.join(" ")}`);
        }
      }
    }
  }
  return { problems, read, withheld };
}

/** What a role reads of the lesson A ficha do paciente, which has a block for each profile mix. */
const fichaText = (role: Role) =>
  textOf(guideLessonsFor(role).find((lesson) => lesson.id === "pacientes.ficha-do-paciente")!.blocks).join("\n");

describe("each role reads only the role blocks written for it (G1-3)", () => {
  it("reception: every Receção block and no other; the ficha has no Registos clínicos, no Zona de risco, no therapist note", () => {
    const audit = roleBlockAudit("reception");
    expect(audit.problems).toEqual([]);
    expect(audit.read).toBeGreaterThan(0);
    expect(audit.withheld).toBeGreaterThan(0);
    expect(fichaText("reception")).not.toContain("Registos clínicos");
    expect(fichaText("reception")).not.toContain("Zona de risco");
    expect(fichaText("reception")).not.toContain("Pacientes visíveis");
  });

  it("therapist: every Terapeuta block and no other; the ficha has Registos clínicos and the therapist note, no Zona de risco", () => {
    const audit = roleBlockAudit("therapist");
    expect(audit.problems).toEqual([]);
    expect(audit.read).toBeGreaterThan(0);
    expect(audit.withheld).toBeGreaterThan(0);
    expect(fichaText("therapist")).toContain("Registos clínicos");
    expect(fichaText("therapist")).toContain("Pacientes visíveis");
    expect(fichaText("therapist")).not.toContain("Zona de risco");
  });

  it("admin: every Proprietário block and no other; the ficha has Registos clínicos and Zona de risco, no therapist note", () => {
    const audit = roleBlockAudit("admin");
    expect(audit.problems).toEqual([]);
    expect(audit.read).toBeGreaterThan(0);
    expect(audit.withheld).toBeGreaterThan(0);
    expect(fichaText("admin")).toContain("Registos clínicos");
    expect(fichaText("admin")).toContain("Zona de risco");
    expect(fichaText("admin")).not.toContain("Pacientes visíveis");
  });

  it("owner: every Proprietário block and no other; the ficha has Registos clínicos and Zona de risco, no therapist note", () => {
    const audit = roleBlockAudit("owner");
    expect(audit.problems).toEqual([]);
    expect(audit.read).toBeGreaterThan(0);
    expect(audit.withheld).toBeGreaterThan(0);
    expect(fichaText("owner")).toContain("Registos clínicos");
    expect(fichaText("owner")).toContain("Zona de risco");
    expect(fichaText("owner")).not.toContain("Pacientes visíveis");
  });

  // blocksFor on seeded blocks, for every role: the shared paragraph always,
  // a block for its profile unwrapped in place, any other block dropped.
  it("seeded: blocksFor keeps shared text, unwraps the viewer's blocks in place and drops the rest", () => {
    const para = (text: string): GuideBlock => ({ type: "para", spans: [{ text }] });
    const seeded: GuideBlock[] = [
      para("Todos"),
      { type: "role", roles: ["rececao"], blocks: [para("Receção")] },
      { type: "role", roles: ["terapeuta", "proprietario"], blocks: [para("Terapeuta e Proprietário")] },
      para("Fim"),
    ];
    const read = (role: Role) => textOf(blocksFor(role, seeded));
    expect(read("reception")).toEqual(["Todos", "Receção", "Fim"]);
    expect(read("therapist")).toEqual(["Todos", "Terapeuta e Proprietário", "Fim"]);
    expect(read("admin")).toEqual(["Todos", "Terapeuta e Proprietário", "Fim"]);
    expect(read("owner")).toEqual(["Todos", "Terapeuta e Proprietário", "Fim"]);
    for (const role of ROLES) expect(blocksFor(role, seeded).every((block) => block.type === "para")).toBe(true);
  });

  // The FAQ goes through the same resolution (its entries arrive in PR 4).
  it("seeded: an FAQ entry's role blocks are resolved the same way", () => {
    const base = GUIDE_DATA.lessons.find((lesson) => lesson.id === "agenda.marcar-consulta")!;
    const entry = {
      ...base,
      id: "perguntas.exemplo",
      blocks: [
        { type: "para", spans: [{ text: "Todos" }] },
        { type: "role", roles: ["terapeuta"], blocks: [{ type: "para", spans: [{ text: "Terapeuta" }] }] },
      ] as GuideBlock[],
    };
    const orders = Object.fromEntries(
      Object.entries(GUIDE_DATA.orders).map(([profile, order]) => [profile, { ...order, faq: [entry.id] }]),
    ) as GuideData["orders"];
    const data: GuideData = { ...GUIDE_DATA, faq: [entry], orders };
    expect(guideFaqFor("reception", data).map((item) => textOf(item.blocks))).toEqual([["Todos"]]);
    expect(guideFaqFor("therapist", data).map((item) => textOf(item.blocks))).toEqual([["Todos", "Terapeuta"]]);
  });
});

// G1-3 INSIDE AN FAQ ANSWER. The same audit, run on the FAQ entries each role
// reads, and, as with A ficha do paciente above, the lines each role reads
// from the answers' role blocks written out by hand from the ruled proposal,
// not read back from the code. So a role block widened to a role it was not
// written for fails here by name, even though the helper resolves it
// faithfully: the therapist does not read the Notificações line of Adicionar
// paciente, because it cannot open that queue (it needs guest_requests:read).

/** The lines a role reads in its FAQ answers that are not shared text, as "entry: line", in order. */
function faqRoleLines(role: Role, data: GuideData = GUIDE_DATA): string[] {
  const source = new Map(data.faq.map((entry) => [entry.id, entry]));
  return guideFaqFor(role, data).flatMap((entry) => {
    const shared = textOf(source.get(entry.id)!.blocks.filter((block) => block.type !== "role"));
    return textOf(entry.blocks)
      .filter((line) => !shared.includes(line))
      .map((line) => `${entry.id}: ${line}`);
  });
}

const NOTIFICACOES_LINE =
  "perguntas.adicionar-paciente: O pedido de um cliente novo feito na marcação online trata-se em Notificações, com Criar paciente e marcar.";
const CORRIGIR_ESTADO_LINE =
  "perguntas.concluir-consulta: Se a consulta ficou Concluída ou Falta por engano, corrija na ficha do paciente: em Gerir marcação, use Corrigir estado.";
const FAQ_ROLE_LINES: Record<Role, string[]> = {
  reception: [NOTIFICACOES_LINE, CORRIGIR_ESTADO_LINE],
  therapist: [
    "perguntas.marcar-consulta: O campo Terapeuta já traz o seu nome.",
    "perguntas.bloquear-horario: O campo Terapeuta já traz o seu nome.",
    "perguntas.concluir-consulta: Depois da consulta, escreva o registo em Nova ficha clínica.",
  ],
  admin: [NOTIFICACOES_LINE, CORRIGIR_ESTADO_LINE],
  owner: [NOTIFICACOES_LINE, CORRIGIR_ESTADO_LINE],
};

// A ROLE LINE OF AN ANSWER IS HELD TO ITS SCREEN'S GATE. Each role line that
// sends the reader to a gated screen, with that screen's own check read from
// its source (as in PAGE_GATES below) and that check as a predicate on the
// role. No role may read the line and be refused by the screen.
const FAQ_LINE_GATES: { entry: string; label: string; page: string; check: string; admits: (role: Role) => boolean }[] = [
  {
    entry: "perguntas.adicionar-paciente",
    label: "Criar paciente e marcar",
    page: "apps/web/app/notificacoes/page.tsx",
    check: 'const canReadGuestQueue = can(ctx.role, "guest_requests:read");',
    admits: (role) => can(role, "guest_requests:read"),
  },
  {
    entry: "perguntas.concluir-consulta",
    label: "Corrigir estado",
    page: "apps/web/app/patients/[id]/page.tsx",
    check: 'const canCancelAppointments = can(ctx.role, "appointments:delete");',
    admits: (role) => can(role, "appointments:delete"),
  },
  {
    entry: "perguntas.concluir-consulta",
    label: "Nova ficha clínica",
    page: "apps/web/app/clinical/new/page.tsx",
    check: 'if (!can(ctx.role, "clinical_records:author")) redirect("/clinical");',
    admits: (role) => can(role, "clinical_records:author"),
  },
];

/** The roles that read each gated line, and every reader the line's screen refuses. */
function faqLineGateAudit(data: GuideData = GUIDE_DATA): { readers: Record<string, Role[]>; problems: string[] } {
  const readers: Record<string, Role[]> = {};
  const problems: string[] = [];
  for (const gate of FAQ_LINE_GATES) {
    const key = `${gate.entry} ${gate.label}`;
    readers[key] = ROLES.filter((role) =>
      faqRoleLines(role, data).some((line) => line.startsWith(`${gate.entry}: `) && line.includes(gate.label)),
    );
    for (const role of readers[key]) {
      if (!gate.admits(role)) problems.push(`${role} reads "${gate.label}" in ${gate.entry}, and ${gate.page} refuses it`);
    }
  }
  return { readers, problems };
}

describe("each role reads only the FAQ role blocks written for it (G1-3)", () => {
  for (const role of ["reception", "therapist", "admin", "owner"] as const) {
    it(`${role}: every block for its profile and no other, and exactly its ruled role lines`, () => {
      const audit = roleBlockAudit(role, "faq");
      expect(audit.problems).toEqual([]);
      expect(audit.read).toBeGreaterThan(0);
      expect(audit.withheld).toBeGreaterThan(0);
      expect(faqRoleLines(role)).toEqual(FAQ_ROLE_LINES[role]);
    });
  }

  it("a role line that names a gated screen is read only by roles that screen admits", () => {
    for (const gate of FAQ_LINE_GATES) {
      expect(readFileSync(join(REPO_ROOT, gate.page), "utf8"), gate.page).toContain(gate.check);
    }
    const audit = faqLineGateAudit();
    expect(audit.problems).toEqual([]);
    // Each gated line is read by someone, so the check above is never true of nothing.
    expect(audit.readers).toEqual({
      "perguntas.adicionar-paciente Criar paciente e marcar": ["owner", "admin", "reception"],
      "perguntas.concluir-consulta Corrigir estado": ["owner", "admin", "reception"],
      "perguntas.concluir-consulta Nova ficha clínica": ["therapist"],
    });
  });

  // The review's case: the Adicionar paciente block widened to the therapist.
  // The helper resolves it faithfully, so only the ruled lines and the gate
  // can catch it, and both do.
  it("seeded: the Notificações line widened to the therapist fails the ruled lines and the gate", () => {
    const widen = (block: GuideBlock): GuideBlock =>
      block.type === "role" && block.roles.join(" ") === "rececao proprietario"
        ? { ...block, roles: ["rececao", "terapeuta", "proprietario"] }
        : block;
    const faq = GUIDE_DATA.faq.map((entry) =>
      entry.id === "perguntas.adicionar-paciente" ? { ...entry, blocks: entry.blocks.map(widen) } : entry,
    );
    const widened: GuideData = { ...GUIDE_DATA, faq };
    expect(faqRoleLines("therapist", widened)).toContain(NOTIFICACOES_LINE);
    expect(faqRoleLines("therapist", widened)).not.toEqual(FAQ_ROLE_LINES.therapist);
    expect(faqLineGateAudit(widened).problems).toEqual([
      'therapist reads "Criar paciente e marcar" in perguntas.adicionar-paciente, and apps/web/app/notificacoes/page.tsx refuses it',
    ]);
  });
});

// A LESSON'S GATE IS ITS PAGE'S GATE. For these lessons the page checks
// something the capability name alone does not show, or a review found the
// two apart. `check` is the page's own line, read from its source here, and
// `admits` is that line as a predicate on the role. No role may hold the
// lesson's capability and be refused by the page: that role would be shown a
// lesson about a screen that turns it away.
//
//   * Faturação lists invoices under invoices:read, but the page is gated on
//     invoices:issue, which a therapist lacks (W10-04).
//   * Enviar uma mensagem de teste has no capability: the page checks the
//     owner role itself. The lesson's roles:manage stands in for it because
//     only the owner holds roles:manage; this row fails the day another role
//     is granted it.
const PAGE_GATES: { lesson: string; page: string; check: string; admits: (role: Role) => boolean }[] = [
  {
    lesson: "faturacao.faturas-de-um-periodo",
    page: "apps/web/app/invoicing/page.tsx",
    check: 'if (!can(ctx.role, "invoices:issue")) {',
    admits: (role) => can(role, "invoices:issue"),
  },
  {
    lesson: "portal.mensagem-de-teste",
    page: "apps/web/app/admin/messaging-check/page.tsx",
    check: 'if (actor.role !== "owner") redirect("/dashboard");',
    admits: (role) => role === "owner",
  },
  {
    lesson: "pacientes.atribuir-terapeutas",
    page: "apps/web/app/patients/[id]/page.tsx",
    check: 'const canManageCareTeam = can(ctx.role, "care_team:manage");',
    admits: (role) => can(role, "care_team:manage"),
  },
];

/** The roles that hold the capability but that the page refuses. */
const refusedHolders = (capability: string, admits: (role: Role) => boolean) =>
  ROLES.filter((role) => can(role, capability as Capability) && !admits(role));

describe("a lesson's gate is its page's gate", () => {
  for (const gate of PAGE_GATES) {
    it(`${gate.lesson}: ${gate.page} still checks what the lesson assumes, and admits every role holding the lesson's capability`, () => {
      const source = readFileSync(join(REPO_ROOT, gate.page), "utf8");
      expect(source).toContain(gate.check);
      const lesson = GUIDE_DATA.lessons.find((item) => item.id === gate.lesson);
      expect(lesson, `${gate.lesson} is not a published lesson`).toBeDefined();
      expect(lesson!.capability).not.toBeNull();
      expect(refusedHolders(lesson!.capability!, gate.admits)).toEqual([]);
      for (const role of ROLES) {
        if (guideLessonsFor(role).some((item) => item.id === gate.lesson)) expect(gate.admits(role), `${role} reads ${gate.lesson}`).toBe(true);
      }
    });
  }

  it("seeded: the capability the review found on Faturação, invoices:read, admits a therapist the page refuses", () => {
    const invoicing = PAGE_GATES.find((gate) => gate.lesson === "faturacao.faturas-de-um-periodo")!;
    expect(refusedHolders("invoices:read", invoicing.admits)).toEqual(["therapist"]);
    expect(refusedHolders("invoices:issue", invoicing.admits)).toEqual([]);
  });

  it("seeded: the owner-only page refuses every role but the owner, so only an owner-only capability may stand in for it", () => {
    const messaging = PAGE_GATES.find((gate) => gate.lesson === "portal.mensagem-de-teste")!;
    expect(refusedHolders("settings:manage", messaging.admits)).toEqual(["admin"]);
    expect(refusedHolders("roles:manage", messaging.admits)).toEqual([]);
  });
});
