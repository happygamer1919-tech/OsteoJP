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

import { PERMISSIONS, ROLES, can, type Role } from "@osteojp/auth";
import { describe, expect, it } from "vitest";

import { loadGuide, PROFILES } from "../../../../docs/guide/build/guide-model.mjs";

import { GUIDE_DATA, PROFILE_OF_ROLE, guideLessonsFor, guideSectionsFor, isCapability } from "./guide";

const ids = (role: Role) => guideLessonsFor(role).map((lesson) => lesson.id);
const sectionIds = (role: Role) => guideSectionsFor(role).map((entry) => entry.section.id);

// Receção: Início, Agenda, Pacientes, Pacotes, Marcação online, Portal do
// paciente, Faturação, Equipa e Horários. 37 lessons, M1 held: 36.
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
  "pacientes.atualizar-dados-e-terapeutas",
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
// Pacotes, Portal do paciente, Marcação online, Registos. 57 lessons, M1
// held: 56, which is every published lesson.
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
  "pacientes.atualizar-dados-e-terapeutas",
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
// the admin role lacks: Atualizar dados e atribuir terapeutas
// (care_team:manage), Recuperar um paciente eliminado (patients:recover),
// every Registos lesson (clinical_records:author, :sign, :review) and Enviar
// uma mensagem de teste (roles:manage; the page is owner only). 47 lessons.
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
  it("reception: the 36 Receção lessons, and no Registos lesson", () => {
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

  it("admin: the 47 Proprietário lessons whose capability the admin role holds", () => {
    expect(ids("admin")).toEqual(ADMIN);
    // The same list, derived: the owner's lessons filtered by can("admin", capability).
    const derived = guideLessonsFor("owner")
      .filter((lesson) => lesson.capability === null || (isCapability(lesson.capability) && can("admin", lesson.capability)))
      .map((lesson) => lesson.id);
    expect(ids("admin")).toEqual(derived);
    expect(sectionIds("admin")).not.toContain("registos");
  });

  it("owner: the 56 Proprietário lessons, which are every published lesson", () => {
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
    expect(all.length).toBe(57);
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
