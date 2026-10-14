/**
 * page-survey-rows.test.tsx: SAT-01 (S11, spec 7.7). THE PATIENT'S SURVEY SENDS
 * AND ANSWERS ON THE FICHA: WHO GETS THE SECTION, WHAT IT DRAWS, AND THAT
 * NOBODY GETS ANY OF IT WHILE THE SURVEY IS SWITCHED OFF.
 *
 * The REAL page component renders here, on the Resumo tab, with its data reads
 * replaced by stubs (the harness of page-survey-switch.test.tsx). The rules
 * are NOT stubbed: `lib/patients/survey-rows.ts`, `lib/patients/survey-switch.ts`,
 * `lib/reminders/survey-mode.ts` and `lib/surveys/survey-list-core.ts` are the
 * real modules, reading the real variable. Only the list's database read
 * (`listSurveySends`) is a recorder, so what is pinned is the page's wiring:
 *   - SURVEY_SEND_MODE off, unset, or any near-miss value: no section, no
 *     label, no row, for any role, on any address of the ficha, and the read
 *     is not made;
 *   - canary and on: every staff role gets the section with the patient's
 *     sends, read for THIS patient with the viewer's own context; a therapist
 *     gets it without the switch;
 *   - an answer the viewer reads shows its lines; one they may not read shows
 *     the reserved sentence and no line of the answer; a send with no answer
 *     shows neither;
 *   - no send: the owner reads copy text 78; every other role reads text 88
 *     (strategy Q-19, 2026-10-14), since only the owner's read is the whole;
 *   - there is no send button;
 *   - it is on Resumo and on no other tab.
 * Which sends and which answers each role is given is the database's, and is
 * measured in `lib/surveys/survey-list.db.test.ts`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@osteojp/i18n";

import type { SurveyListEntry } from "../../../lib/surveys/survey-list-core";

vi.mock("server-only", () => ({}));

const PATIENT_ID = "4444aaaa-4444-4444-8444-44444444bbbb";

const h = vi.hoisted(() => ({
  ctx: { tenantId: "11111111-1111-4111-8111-111111111111", role: "reception", userId: "22222222-2222-4222-8222-222222222222" } as {
    tenantId: string;
    role: string;
    userId: string;
  },
  /** What the patients row holds for the switch; null is a row the viewer cannot read. */
  stored: true as boolean | null,
  /** What the list's read returns for this viewer. */
  rows: [] as unknown[],
  /** Every call of the list's read. */
  reads: [] as Array<{ ctx: unknown; opts: unknown }>,
  /** What the page asked `getPatient` for the second time (the "may act" read). */
  mayAct: true,
  deletedAt: null as Date | null,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/patients",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));

const patient = {
  id: PATIENT_ID,
  fullName: "Zzz Paciente Avaliacao Teste",
  mergedIntoId: null,
  deletedAt: null,
  primaryLocationId: null,
  dateOfBirth: null,
  sex: null,
  nif: "999000111",
  nifExempt: false,
  nifExemptReason: null,
  patientNumber: null,
  phone: null,
  email: null,
  profession: null,
  city: null,
  region: null,
  referralSource: null,
  contraindicationEpilepsy: false,
  contraindicationPregnancy: false,
  contraindicationPacemaker: false,
  contraindicationOther: false,
  contraindicationOtherNote: null,
};

// The switch's own read (survey-switch.ts): a select of the one column.
vi.mock("../../../lib/auth/context", () => ({
  getRequestContext: async () => h.ctx,
  requireRequestContext: async () => h.ctx,
  runScoped: async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => (h.stored === null ? [] : [{ enabled: h.stored }]),
          }),
        }),
      }),
    }),
}));
// THE ONE READ BEHIND THE ROWS, replaced by a recorder. `lib/patients/survey-rows.ts`
// (when the section is offered) is the real module.
vi.mock("../../../lib/surveys/survey-list", () => ({
  listSurveySends: async (ctx: unknown, opts: unknown) => {
    h.reads.push({ ctx, opts });
    return { rows: h.rows, total: h.rows.length, page: 1, pageSize: 50, pageCount: 1 };
  },
}));
vi.mock("../../../lib/patients/queries", () => ({
  // The ficha's read (`access: "read"`) always finds the patient; the narrow
  // read behind `canActOnPatient` finds them only when the viewer may act.
  getPatient: async (_id: string, opts: { access?: string } = {}) =>
    opts.access === "read" || h.mayAct ? { ...patient, deletedAt: h.deletedAt } : null,
  getPatientHardDeleteBlockers: async () => ({ hasClinicalRecords: true, hasOtherReferences: false, counts: [] }),
}));
vi.mock("../../../lib/patients/rgpd-acceptance", () => ({ getLatestRgpdAcceptance: async () => ({ id: "x" }) }));
vi.mock("../../../lib/clinical/ficha-groups", () => ({ listFichaRecords: async () => [] }));
vi.mock("../../../lib/clinical/episodes", () => ({ listOpenAppEpisodes: async () => [] }));
vi.mock("../../../lib/clinical/records", () => ({ listActiveTemplates: async () => [] }));
vi.mock("../../../lib/invoices/queries", () => ({ listActiveLocations: async () => [], listInvoices: async () => [] }));
vi.mock("../../../lib/patients/documents", () => ({ listPatientDocuments: async () => [] }));
vi.mock("../../../lib/scheduling/data", () => ({
  getAgendaOptions: async () => ({ therapists: [], locations: [], bookableLocations: [], services: [], packs: [] }),
  listPatientAppointments: async () => [],
}));
vi.mock("../../../lib/auth/viewer-locations", () => ({ bookingLocationScope: async () => null }));
vi.mock("../../../lib/packs/instances", () => ({ listPatientPackInstances: async () => [] }));
vi.mock("../../../lib/patients/note-revisions", () => ({ listPatientNotes: async () => [] }));
vi.mock("../../../lib/guest-intake/queries", () => ({ listGuestIntakesForPatient: async () => [] }));
vi.mock("../../../lib/admin/care-team", () => ({ listCareTeam: async () => [], listCareTeamForTherapist: async () => null }));
// Server actions: inert here. The page only hands them to forms and buttons.
vi.mock("../../clinical/[id]/actions", () => ({ versionRecordAction: vi.fn() }));
vi.mock("../../clinical/new/actions", () => ({ createRecordAction: vi.fn() }));
vi.mock("./episode-actions", () => ({ createEpisodeAction: vi.fn() }));
vi.mock("./actions", () => ({ hardDeleteRecordAction: vi.fn(), annulRecordAction: vi.fn() }));
vi.mock("./care-team-actions", () => ({ assignTherapistAction: vi.fn(), removeTherapistAction: vi.fn() }));
vi.mock("./survey-switch-actions", () => ({ setSurveySwitchAction: vi.fn() }));
vi.mock("../../../lib/patients/actions", () => ({
  softDeletePatientAction: vi.fn(),
  restorePatientAction: vi.fn(),
  hardDeletePatientAction: vi.fn(),
  preflightHardDeleteAction: vi.fn(),
  searchPatientsAction: vi.fn(),
}));

import PatientProfilePage from "./page";

const s = getStrings("pt");

const ROLES = ["owner", "admin", "reception", "therapist"] as const;
const SECTION = 'data-testid="ficha-survey-section"';
const ROW = 'data-testid="ficha-survey-row"';
const NONE = "Nenhuma avaliação de satisfação enviada.";
/** Text 88 (strategy, Q-19, 2026-10-14): no send this viewer may read. */
const NONE_VISIBLE = "Nenhuma avaliação de satisfação visível para si.";
const RESERVED =
  "Resposta visível apenas para o terapeuta que realizou a consulta, para a receção e os administradores dessa clínica e para o proprietário.";
/** The labels of copy section G, in the order the section reads. */
const SEND_LABELS = ["Consulta", "Terapeuta", "Clínica", "Envio", "Resposta"];
const ANSWER_LABELS = ["Recomendação (0 a 10)", "Satisfação (1 a 5)", "Comentário", "Aceita contacto", "Respondido em"];

const entry = (over: Partial<SurveyListEntry> = {}): SurveyListEntry => ({
  sendId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  sentAt: new Date("2026-05-24T10:00:00Z"),
  channel: "email",
  origin: "automatic",
  outcome: null,
  senderName: null,
  patientId: PATIENT_ID,
  patientName: "Zzz Paciente Avaliacao Teste",
  patientDeleted: false,
  visitStartsAt: new Date("2026-05-23T09:00:00Z"),
  therapistName: "Zzz Terapeuta Teste",
  clinicName: "Zzz Clinica Teste",
  answer: null,
  ...over,
});
const ANSWER = {
  nps: 9,
  rating: 4,
  comment: "Zzz comentario de teste",
  commentPurgedAt: null,
  contactConsent: true,
  submittedAt: new Date("2026-05-25T14:30:00Z"),
};

async function render(role: string, query: Record<string, string> = {}): Promise<string> {
  h.ctx = { ...h.ctx, role };
  const el = await PatientProfilePage({
    params: Promise.resolve({ id: PATIENT_ID }),
    searchParams: Promise.resolve(query),
  });
  return renderToStaticMarkup(el);
}

/** The Resumo tab rendered: its one card that is always there. */
const tabRendered = (html: string) => html.includes(s["patients.cardPersonal"]);
/** The survey section's own markup, or "" when it is not drawn. */
const sectionOf = (html: string) => (html.includes(SECTION) ? html.split(SECTION)[1]!.split("</section>")[0]! : "");
/** Each send's own markup. */
const rowsOf = (html: string) => sectionOf(html).split(ROW).slice(1);
const labelAt = (html: string, label: string) => html.indexOf(`>${label}</dt>`);

const saved = process.env.SURVEY_SEND_MODE;
beforeEach(() => {
  h.stored = true;
  h.rows = [entry()];
  h.reads = [];
  h.mayAct = true;
  h.deletedAt = null;
  process.env.SURVEY_SEND_MODE = "on";
});
afterEach(() => {
  if (saved === undefined) delete process.env.SURVEY_SEND_MODE;
  else process.env.SURVEY_SEND_MODE = saved;
});

describe("while the survey is switched off, the ficha shows nothing of it", () => {
  it.each([undefined, "", "off", "ON", "On", " on", "on ", "Canary", "true", "1"])(
    "SURVEY_SEND_MODE=%j: no section, no label and no row for any role, on any address, and nothing is read",
    async (mode) => {
      if (mode === undefined) delete process.env.SURVEY_SEND_MODE;
      else process.env.SURVEY_SEND_MODE = mode;
      // The patient HAS an answered send: what is absent is not an empty list.
      h.rows = [entry({ outcome: "answered", answer: ANSWER }), entry({ sendId: "s2", outcome: "answered" })];
      for (const role of ROLES) {
        // The plain address, the tab named, and addresses a person might guess.
        const addresses: Array<Record<string, string>> = [
          {},
          { tab: "resumo" },
          { tab: "avaliacoes" },
          { tab: "resumo", m: "avaliacaoErro" },
        ];
        for (const query of addresses) {
          const html = await render(role, query);
          const at = `${role} ${JSON.stringify(query)}`;
          expect(tabRendered(html), at).toBe(true);
          expect(html, at).not.toContain(SECTION);
          expect(html, at).not.toContain(ROW);
          expect(html, at).not.toContain(s["patients.surveySwitchTitle"]);
          expect(html, at).not.toContain(NONE);
          expect(html, at).not.toContain(NONE_VISIBLE);
          expect(html, at).not.toContain(RESERVED);
          expect(html, at).not.toContain("Zzz comentario de teste");
          for (const label of ANSWER_LABELS) expect(html, `${at} ${label}`).not.toContain(label);
        }
      }
      expect(h.reads).toEqual([]);

      // CONTROL: the same request with the survey on draws the section and reads.
      process.env.SURVEY_SEND_MODE = "on";
      expect(await render("owner")).toContain(ROW);
      expect(h.reads).toHaveLength(1);
    },
  );
});

describe.each(["canary", "on"])("SURVEY_SEND_MODE=%s", (mode) => {
  beforeEach(() => {
    process.env.SURVEY_SEND_MODE = mode;
  });

  it.each(ROLES)("%s gets the section with the patient's send, read for this patient as themselves", async (role) => {
    const html = await render(role);
    const section = sectionOf(html);
    expect(section).toContain(s["patients.surveySwitchTitle"]);
    expect(rowsOf(html)).toHaveLength(1);
    expect(section).toContain("24/05/2026, automático");
    expect(section).toContain("23/05/2026");
    expect(section).toContain("Zzz Terapeuta Teste");
    expect(section).toContain("Zzz Clinica Teste");
    expect(section).toContain("Sem resposta");
    expect(h.reads).toEqual([{ ctx: h.ctx, opts: { patientId: PATIENT_ID, page: 1 } }]);
  });

  it("owner, admin and reception have the switch above the sends; a therapist has the sends alone", async () => {
    for (const role of ["owner", "admin", "reception"]) {
      const section = sectionOf(await render(role));
      expect(section.indexOf('role="switch"'), role).toBeGreaterThan(0);
      expect(section.indexOf(ROW), role).toBeGreaterThan(section.indexOf('role="switch"'));
    }
    const therapist = sectionOf(await render("therapist"));
    expect(therapist).toContain(ROW);
    expect(therapist).not.toContain('role="switch"');
    expect(therapist).not.toContain(s["patients.surveySwitchLabel"]);
    expect(therapist).not.toContain("<form");
  });

  it("a therapist who reads the ficha and may not act on the patient still gets what the read gives them", async () => {
    // The care-team reader (CARE-02a). The list is a read: the database decides
    // its rows, here none, and the section says so.
    h.mayAct = false;
    h.rows = [];
    const section = sectionOf(await render("therapist"));
    expect(section).toContain(NONE_VISIBLE);
    expect(section).not.toContain(NONE);
    expect(section).not.toContain('role="switch"');
    expect(h.reads).toHaveLength(1);
  });

  it("a send with no answer shows the send's lines, in order, and no line of an answer", async () => {
    const [row] = rowsOf(await render("reception"));
    const at = SEND_LABELS.map((label) => labelAt(row!, label));
    expect(at.every((i) => i > 0), JSON.stringify(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    for (const label of ANSWER_LABELS) expect(labelAt(row!, label), label).toBe(-1);
    expect(row).toContain('data-answer="open"');
    expect(row).not.toContain(RESERVED);
    // Not the patient and not the channel: copy section G names neither.
    expect(labelAt(row!, "Paciente")).toBe(-1);
    expect(labelAt(row!, "Enviado por")).toBe(-1);
    expect(row).not.toContain("Abrir ficha");
  });

  it("an answer the viewer reads shows its scores, comment, contact choice and time, and no reserved sentence", async () => {
    h.rows = [entry({ origin: "manual", senderName: "Zzz Rececao Teste", outcome: "answered", answer: ANSWER })];
    const [row] = rowsOf(await render("owner"));
    const at = [...SEND_LABELS, ...ANSWER_LABELS].map((label) => labelAt(row!, label));
    expect(at.every((i) => i > 0), JSON.stringify(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(row).toContain("24/05/2026, por Zzz Rececao Teste");
    expect(row).toContain("Com resposta");
    expect(row).toMatch(/>9<\/dd>/);
    expect(row).toMatch(/>4<\/dd>/);
    expect(row).toContain("Zzz comentario de teste");
    expect(row).toMatch(/>Sim<\/dd>/);
    expect(row).toContain("25/05/2026, 15:30");
    expect(row).toContain('data-answer="shown"');
    expect(row).not.toContain(RESERVED);
  });

  it("an answer the viewer may not read shows the reserved sentence and no line of the answer", async () => {
    h.rows = [entry({ outcome: "answered", answer: null })];
    const [row] = rowsOf(await render("therapist"));
    expect(row).toContain("Com resposta");
    expect(row).toContain(RESERVED);
    expect(row).toContain('data-testid="ficha-survey-answer-reserved"');
    expect(row).toContain('data-answer="reserved"');
    for (const label of ANSWER_LABELS) expect(labelAt(row!, label), label).toBe(-1);
    // The send's own lines still read.
    for (const label of SEND_LABELS) expect(labelAt(row!, label), label).toBeGreaterThan(0);
  });

  it("several sends are drawn in the order the read returned them, each with its own answer", async () => {
    h.rows = [
      entry({ sendId: "s-new", sentAt: new Date("2026-08-02T10:00:00Z") }),
      entry({ sendId: "s-mid", sentAt: new Date("2026-07-01T10:00:00Z"), outcome: "answered", answer: null }),
      entry({ sendId: "s-old", sentAt: new Date("2026-05-24T10:00:00Z"), outcome: "answered", answer: ANSWER }),
    ];
    const rows = rowsOf(await render("therapist"));
    expect(rows.map((r) => /data-answer="([a-z]+)"/.exec(r)?.[1])).toEqual(["open", "reserved", "shown"]);
    expect(rows[0]).toContain("02/08/2026, automático");
    expect(rows[1]).toContain(RESERVED);
    expect(rows[1]).not.toContain("Zzz comentario de teste");
    expect(rows[2]).toContain("Zzz comentario de teste");
    expect(rows[2]).not.toContain(RESERVED);
  });

  it("no send: the owner reads text 78, every other role text 88, and no row", async () => {
    h.rows = [];
    for (const role of ROLES) {
      const section = sectionOf(await render(role));
      const [said, notSaid] = role === "owner" ? [NONE, NONE_VISIBLE] : [NONE_VISIBLE, NONE];
      expect(section, role).toContain(`data-testid="ficha-survey-rows-none">${said}</p>`);
      expect(section, role).not.toContain(notSaid);
      expect(section, role).not.toContain(ROW);
    }
  });

  it("a send drawn says neither sentence, for any role", async () => {
    for (const role of ROLES) {
      const section = sectionOf(await render(role));
      expect(section, role).toContain(ROW);
      expect(section, role).not.toContain(NONE);
      expect(section, role).not.toContain(NONE_VISIBLE);
    }
  });

  it("there is no send button, for any role", async () => {
    h.rows = [entry(), entry({ sendId: "s2", outcome: "answered", answer: ANSWER })];
    for (const role of ROLES) {
      const section = sectionOf(await render(role));
      expect(section, role).toContain(ROW);
      expect(section, role).not.toContain("Enviar avaliação<");
      expect(section, role).not.toContain("Último envio");
      // The only button of the section is the switch, where the role has it.
      expect(section.split("<button").length - 1, role).toBe(role === "therapist" ? 0 : 1);
    }
  });

  it("a soft-deleted patient has no switch, and the sends still read", async () => {
    h.deletedAt = new Date("2026-06-01T00:00:00Z");
    h.stored = null;
    const section = sectionOf(await render("owner"));
    expect(section).toContain(ROW);
    expect(section).not.toContain('role="switch"');
  });

  it("it is on Resumo and on no other tab, and no other tab reads the sends", async () => {
    for (const tab of ["consultas", "notas", "registos", "documentos", "faturacao"]) {
      const html = await render("owner", { tab });
      expect(html, tab).not.toContain(SECTION);
      expect(html, tab).not.toContain(ROW);
    }
    expect(h.reads).toEqual([]);
    // CONTROL: the same viewer on Resumo has it.
    expect(await render("owner", { tab: "resumo" })).toContain(ROW);
  });
});
