/**
 * page-packs-tab.test.tsx: PACK-FICHA-01. THE PATIENT'S PACKS INSIDE THE FICHA.
 *
 * The REAL page component renders here with its data reads replaced by stubs
 * (the harness of page-survey-rows.test.tsx). The one read behind the tab,
 * `listPatientPacks`, is a recorder, so what is pinned is the page's wiring:
 *   - every staff role gets a "Packs" tab, right after Marcações;
 *   - `?tab=packs` reads THIS patient's pacotes, with the viewer's own
 *     context, and draws the tab panel with them;
 *   - no other tab makes that read;
 *   - the Marcações tab keeps its existing pacote card;
 *   - PACK-LABEL-01: the Marcações tab makes the SAME read, once, when it has
 *     rows, and draws "<pacote>: Sessão N de M" under the rows it numbers.
 * What each role is GIVEN by the read is the database's, measured in
 * `lib/packs/in-use-read.db.test.ts`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@osteojp/i18n";

vi.mock("server-only", () => ({}));

const PATIENT_ID = "4444aaaa-4444-4444-8444-44444444bbbb";

const h = vi.hoisted(() => ({
  ctx: {
    tenantId: "11111111-1111-4111-8111-111111111111",
    role: "reception",
    userId: "22222222-2222-4222-8222-222222222222",
  } as { tenantId: string; role: string; userId: string },
  reads: [] as Array<{ ctx: unknown; patientId: unknown }>,
  page: { running: [], finished: [], truncated: false } as {
    running: unknown[];
    finished: unknown[];
    truncated: boolean;
  },
  appointments: [] as unknown[],
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
  fullName: "Zzz Paciente Pack Teste",
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

vi.mock("../../../lib/auth/context", () => ({
  getRequestContext: async () => h.ctx,
  requireRequestContext: async () => h.ctx,
  runScoped: async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [{ enabled: false }] }),
        }),
      }),
    }),
}));
// THE ONE READ BEHIND THE TAB, replaced by a recorder.
vi.mock("../../../lib/packs/in-use-read", () => ({
  listPatientPacks: async (ctx: unknown, patientId: unknown) => {
    h.reads.push({ ctx, patientId });
    return h.page;
  },
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
  listPatientAppointments: async () => h.appointments,
}));
vi.mock("../../../lib/auth/viewer-locations", () => ({ bookingLocationScope: async () => null }));
// A therapist's Marcações tab reads the tenant's machines (U6); no database here.
vi.mock("../../../lib/scheduling/shared-resources", () => ({
  tenantSharedResourceIdsFor: async (ctx: { role: string }) => (ctx.role === "therapist" ? [] : undefined),
}));
vi.mock("../../../lib/packs/instances", () => ({
  listPatientPackInstances: async () => [
    {
      id: "inst-consultas",
      packId: "p",
      packName: "Zzz Pack Marcacoes",
      baseServiceId: "svc",
      baseServiceName: "Zzz Servico",
      sessionsTotal: 10,
      sessionsAvailable: 8,
      sessionsConsumed: 2,
      active: true,
    },
  ],
}));
vi.mock("../../../lib/patients/note-revisions", () => ({ listPatientNotes: async () => [] }));
vi.mock("../../../lib/guest-intake/queries", () => ({ listGuestIntakesForPatient: async () => [] }));
vi.mock("../../../lib/admin/care-team", () => ({ listCareTeam: async () => [], listCareTeamForTherapist: async () => null }));
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
const PANEL = 'id="tabpanel-packs"';

async function render(role: string, query: Record<string, string> = {}): Promise<string> {
  h.ctx = { ...h.ctx, role };
  const el = await PatientProfilePage({
    params: Promise.resolve({ id: PATIENT_ID }),
    searchParams: Promise.resolve(query),
  });
  return renderToStaticMarkup(el);
}

const view = {
  instanceId: "inst-1",
  patientId: PATIENT_ID,
  patientName: "Zzz Paciente Pack Teste",
  packName: "Zzz Pack Fisioterapia 10",
  packPriceCents: 45000,
  sessionsTotal: 10,
  purchasedAt: new Date("2026-10-01T10:00:00Z"),
  reserved: 2,
  free: 8,
  done: 1,
  upcoming: 1,
  legacyConsumed: 0,
  sessions: [
    { appointmentId: "a1", startsAt: new Date("2026-10-20T09:00:00Z") },
    { appointmentId: "a2", startsAt: new Date("2026-11-20T09:00:00Z") },
  ],
  lastUsedAt: new Date("2026-10-20T09:00:00Z"),
};

beforeEach(() => {
  h.reads = [];
  h.page = { running: [], finished: [], truncated: false };
  h.appointments = [];
});

describe("the Packs tab in the ficha", () => {
  it.each(ROLES)("%s: the tab is offered, labelled Packs, right after Marcações", async (role) => {
    const html = await render(role);
    expect(s["patients.tabPacks"]).toBe("Packs");
    const consultas = html.indexOf('aria-controls="tabpanel-consultas"');
    const packs = html.indexOf('aria-controls="tabpanel-packs"');
    const notas = html.indexOf('aria-controls="tabpanel-notas"');
    expect(consultas).toBeGreaterThan(-1);
    expect(packs).toBeGreaterThan(consultas);
    expect(notas).toBeGreaterThan(packs);
  });

  it.each(ROLES)("%s on ?tab=packs: reads THIS patient's pacotes with the viewer's own context", async (role) => {
    h.page = { running: [view], finished: [], truncated: false };
    const html = await render(role, { tab: "packs" });
    expect(h.reads).toHaveLength(1);
    expect(h.reads[0]!.patientId).toBe(PATIENT_ID);
    expect(h.reads[0]!.ctx).toEqual(expect.objectContaining({ role }));
    expect(html).toContain(PANEL);
    expect(html).toContain('data-testid="patient-packs-running-table"');
    expect(html).toContain("Zzz Pack Fisioterapia 10 • 450€");
    expect(html).toMatch(/>2<\/td><td[^>]*>8<\/td><\/tr>/);
    expect(html).toContain(s["packsInUse.paymentSoon"]);
  });

  it("no pacotes: the panel draws the empty state", async () => {
    const html = await render("reception", { tab: "packs" });
    expect(html).toContain(PANEL);
    expect(html).toContain(s["patientPacks.emptyTitle"]);
  });

  // With no marcações (the default here) the Marcações tab has no row to
  // label, so it skips the read too; PACK-LABEL-01's read is pinned below.
  it("no other tab makes the read or draws the panel", async () => {
    for (const tab of ["resumo", "consultas", "notas", "registos", "documentos", "faturacao"]) {
      const html = await render("owner", { tab });
      expect(html, tab).not.toContain(PANEL);
    }
    expect(h.reads).toEqual([]);
  });

  it("Marcações keeps its existing pacote card", async () => {
    const html = await render("reception", { tab: "consultas" });
    expect(html).toContain("Zzz Pack Marcacoes");
    expect(html).not.toContain(PANEL);
  });
});

/**
 * PACK-LABEL-01: the pacote session line on the Marcações tab, through the
 * real page. "a1" and "a2" are the consuming sessions of `view` (the read's
 * answer); "a3" is a cancelled visit, which the read never returns.
 */
describe("the pacote session line on Marcações (PACK-LABEL-01)", () => {
  const appt = (id: string, startsAt: string, status: string) => ({
    id,
    patientId: PATIENT_ID,
    patientName: "Zzz Paciente Pack Teste",
    practitionerId: "33333333-3333-4333-8333-333333333333",
    practitionerName: "Zzz Terapeuta",
    colorKey: null,
    patientTwoId: null,
    patientTwoName: null,
    practitionerTwoId: null,
    practitionerTwoName: null,
    locationId: "55555555-5555-4555-8555-555555555555",
    locationName: "Zzz Clinica",
    serviceId: null,
    serviceName: null,
    room: null,
    startsAt,
    endsAt: startsAt,
    status,
    notes: null,
    recurrenceRule: null,
    recurrenceParentId: null,
    confirmationState: "pending",
    confirmationReceivedAt: null,
    confirmationChannel: null,
    hasNote: true,
    createdBy: null,
    createdByName: null,
    createdAt: null,
  });
  const LINE = 'data-testid="marcacao-pack-session"';

  it.each(ROLES)("%s: one read of THIS patient's pacotes, a line under each numbered row only", async (role) => {
    h.page = { running: [view], finished: [], truncated: false };
    h.appointments = [
      appt("a2", "2026-11-20T09:00:00.000Z", "scheduled"),
      appt("a3", "2026-11-01T09:00:00.000Z", "cancelled"),
      appt("a1", "2026-10-20T09:00:00.000Z", "completed"),
    ];
    const html = await render(role, { tab: "consultas" });
    expect(h.reads).toHaveLength(1);
    expect(h.reads[0]!.patientId).toBe(PATIENT_ID);
    expect(h.reads[0]!.ctx).toEqual(expect.objectContaining({ role }));
    expect(html.split(LINE).length - 1).toBe(2);
    const row = (id: string) => {
      const i = html.indexOf(`data-appointment-id="${id}"`);
      const j = html.indexOf('data-testid="consulta-row"', i);
      return html.slice(i, j === -1 ? undefined : j);
    };
    expect(row("a1")).toContain("Zzz Pack Fisioterapia 10: Sessão 1 de 10");
    expect(row("a2")).toContain("Zzz Pack Fisioterapia 10: Sessão 2 de 10");
    expect(row("a3")).not.toContain(LINE);
    expect(html).not.toContain(PANEL);
  });

  it("a finished pacote numbers its visits too", async () => {
    h.page = { running: [], finished: [view], truncated: false };
    h.appointments = [appt("a1", "2026-10-20T09:00:00.000Z", "completed")];
    const html = await render("reception", { tab: "consultas" });
    expect(html).toContain("Zzz Pack Fisioterapia 10: Sessão 1 de 10");
  });

  it("no pacotes: no line on any row", async () => {
    h.appointments = [appt("a1", "2026-10-20T09:00:00.000Z", "completed")];
    const html = await render("reception", { tab: "consultas" });
    expect(h.reads).toHaveLength(1);
    expect(html).not.toContain(LINE);
  });
});
