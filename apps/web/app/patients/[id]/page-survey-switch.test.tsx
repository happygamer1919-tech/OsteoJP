/**
 * page-survey-switch.test.tsx: SAT-01 (S8). THE SURVEY SWITCH ON THE FICHA: WHO
 * SEES IT, AND THAT NOBODY DOES WHILE THE SURVEY IS SWITCHED OFF.
 *
 * The REAL page component renders here, on the Resumo tab, with its data reads
 * replaced by stubs (the harness of page-add-episode.test.tsx). The rule
 * itself is NOT stubbed: `lib/patients/survey-switch.ts` and
 * `lib/reminders/survey-mode.ts` are the real modules, reading the real
 * variable, so what is pinned is the page's wiring to them:
 *   - SURVEY_SEND_MODE off, unset, or any near-miss value: no section, no
 *     switch, for any role, and the patient's switch is not even read;
 *   - canary and on: owner, admin and reception see the section with the
 *     switch as the database holds it; a therapist gets the section (S11: the
 *     patient's sends, page-survey-rows.test.tsx) and never the switch;
 *   - it is on Resumo and on no other tab;
 *   - its error shows for its own code and not for the care team card's.
 * Every "not drawn" arm first proves the tab rendered.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@osteojp/i18n";

vi.mock("server-only", () => ({}));

const PATIENT_ID = "4444aaaa-4444-4444-8444-44444444bbbb";

const h = vi.hoisted(() => ({
  ctx: { tenantId: "11111111-1111-4111-8111-111111111111", role: "reception", userId: "22222222-2222-4222-8222-222222222222" } as {
    tenantId: string;
    role: string;
    userId: string;
  },
  /** What the patients row holds; null is a row the viewer cannot read. */
  stored: true as boolean | null,
  /** How many times the switch was read from the database. */
  reads: 0,
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

// The one database read the real survey-switch module makes: a select of the
// one column. The chain answers with the stored value and counts the read.
vi.mock("../../../lib/auth/context", () => ({
  getRequestContext: async () => h.ctx,
  requireRequestContext: async () => h.ctx,
  runScoped: async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              h.reads += 1;
              return h.stored === null ? [] : [{ enabled: h.stored }];
            },
          }),
        }),
      }),
    }),
}));
// S11: the section also lists the patient's sends. That read is the list's own
// (`listSurveySends`), answered here with none; what it draws is pinned in
// page-survey-rows.test.tsx.
vi.mock("../../../lib/surveys/survey-list", () => ({
  listSurveySends: async () => ({ rows: [], total: 0, page: 1, pageSize: 50, pageCount: 1 }),
}));
vi.mock("../../../lib/patients/queries", () => ({
  getPatient: async () => patient,
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

const saved = process.env.SURVEY_SEND_MODE;
beforeEach(() => {
  h.stored = true;
  h.reads = 0;
});
afterEach(() => {
  if (saved === undefined) delete process.env.SURVEY_SEND_MODE;
  else process.env.SURVEY_SEND_MODE = saved;
});

describe("while the survey is switched off, staff see nothing of it", () => {
  it.each([undefined, "", "off", "ON", "On", " on", "on ", "Canary", "true"])(
    "SURVEY_SEND_MODE=%j: no section and no switch for any role, and the patient's switch is not read",
    async (mode) => {
      if (mode === undefined) delete process.env.SURVEY_SEND_MODE;
      else process.env.SURVEY_SEND_MODE = mode;
      for (const role of ROLES) {
        const html = await render(role);
        expect(tabRendered(html), role).toBe(true);
        expect(html, role).not.toContain(SECTION);
        expect(html, role).not.toContain(s["patients.surveySwitchTitle"]);
        expect(html, role).not.toContain(s["patients.surveySwitchLabel"]);
        expect(html, role).not.toContain(s["patients.surveySwitchOffNote"]);
        expect(html, role).not.toContain('role="switch"');
      }
      expect(h.reads).toBe(0);
    },
  );
});

describe.each(["canary", "on"])("SURVEY_SEND_MODE=%s", (mode) => {
  beforeEach(() => {
    process.env.SURVEY_SEND_MODE = mode;
  });

  it.each(["owner", "admin", "reception"])("%s sees the section, with the switch as stored", async (role) => {
    const on = await render(role);
    expect(on).toContain(SECTION);
    expect(on).toContain(s["patients.surveySwitchTitle"]);
    expect(on).toContain(s["patients.surveySwitchLabel"]);
    expect(on).toMatch(/role="switch"[^>]*aria-checked="true"/);
    expect(on).not.toContain(s["patients.surveySwitchOffNote"]);

    h.stored = false;
    const off = await render(role);
    expect(off).toMatch(/role="switch"[^>]*aria-checked="false"/);
    expect(off).toContain(s["patients.surveySwitchOffNote"]);
    expect(h.reads).toBe(2);
  });

  it("a therapist gets the section without the switch, and the switch is not read for them", async () => {
    const html = await render("therapist");
    expect(tabRendered(html)).toBe(true);
    // S11: the section is theirs too, for the patient's sends.
    expect(html).toContain(SECTION);
    expect(html).toContain(s["patients.surveySwitchTitle"]);
    expect(html).not.toContain(s["patients.surveySwitchLabel"]);
    expect(html).not.toContain(s["patients.surveySwitchOffNote"]);
    expect(html).not.toContain('role="switch"');
    expect(h.reads).toBe(0);
  });

  it("a patient whose row the viewer cannot read gets no switch", async () => {
    h.stored = null;
    const html = await render("reception");
    expect(tabRendered(html)).toBe(true);
    expect(html).not.toContain(s["patients.surveySwitchLabel"]);
    expect(html).not.toContain('role="switch"');
    // CONTROL: the read was made, so the absence is the read's answer.
    expect(h.reads).toBe(1);
  });

  it("it is on Resumo and on no other tab", async () => {
    for (const tab of ["consultas", "notas", "documentos"]) {
      const html = await render("owner", { tab });
      expect(html, tab).not.toContain(SECTION);
    }
    expect(h.reads).toBe(0);
    // CONTROL: the same viewer on Resumo has it.
    expect(await render("owner", { tab: "resumo" })).toContain(SECTION);
  });

  it("its error shows for its own code, and not for the care team card's", async () => {
    const section = (html: string) => html.split(SECTION)[1]!.split("</section>")[0]!;
    expect(section(await render("reception"))).not.toContain('role="alert"');
    expect(section(await render("reception", { m: "avaliacaoErro" }))).toContain('role="alert"');
    expect(section(await render("reception", { m: "err" }))).not.toContain('role="alert"');
    expect(section(await render("reception", { m: "ok" }))).not.toContain('role="alert"');
  });
});
