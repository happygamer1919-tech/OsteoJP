/**
 * page-schedule-again-options.test.tsx: U6. THE FICHA HANDS ITS "MARCAR
 * NOVAMENTE" SURFACES THE TENANT'S MACHINES, FOR A THERAPIST ONLY.
 *
 * The button hides itself with scheduleAgainForbidden, which needs the ids of
 * the tenant's shared resources (NESA) to let a therapist copy a NESA visit, as
 * the server does. Without them a therapist's NESA visits would lose the
 * button. The REAL page renders here (the harness of
 * page-survey-switch.test.tsx); the Consultas list and the Notas tab are
 * replaced by stand-ins that record the options they were handed, and the
 * machine list is a stub that counts its reads.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("../../../lib/patients/note-revisions", () => ({ listPatientNotes: async () => [{ id: "note-1" }] }));
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


const captured = vi.hoisted(() => ({
  list: [] as unknown[],
  notes: [] as unknown[],
  machineReads: 0,
}));
vi.mock("../../../lib/scheduling/shared-resources", () => ({
  tenantSharedResourceIdsFor: async (ctx: { role: string }) => {
    if (ctx.role !== "therapist") return undefined;
    captured.machineReads += 1;
    return ["nesa-cb"];
  },
}));
vi.mock("./appointments-list", () => ({
  AppointmentsList: (props: unknown) => {
    captured.list.push(props);
    return null;
  },
}));
vi.mock("./notes-tab", () => ({
  NotesTab: (props: unknown) => {
    captured.notes.push(props);
    return null;
  },
}));

import PatientProfilePage from "./page";

async function render(role: string, tab: string): Promise<void> {
  h.ctx = { ...h.ctx, role };
  const el = await PatientProfilePage({
    params: Promise.resolve({ id: PATIENT_ID }),
    searchParams: Promise.resolve({ tab }),
  });
  renderToStaticMarkup(el);
}

type ListProps = { editDrawer: { options: { tenantSharedResourceIds?: string[] } } | null };
type NotesProps = { options: { tenantSharedResourceIds?: string[] } };

beforeEach(() => {
  captured.list = [];
  captured.notes = [];
  captured.machineReads = 0;
});

describe("Consultas: the list's edit panel data carries the tenant's machines", () => {
  it("for a therapist", async () => {
    await render("therapist", "consultas");
    expect(captured.list).toHaveLength(1);
    expect((captured.list[0] as ListProps).editDrawer?.options.tenantSharedResourceIds).toEqual(["nesa-cb"]);
    expect(captured.machineReads).toBe(1);
  });

  it.each(["reception", "admin", "owner"])("not for %s, whom the rule never refuses, and nothing is read", async (role) => {
    await render(role, "consultas");
    expect(captured.list).toHaveLength(1);
    expect((captured.list[0] as ListProps).editDrawer?.options.tenantSharedResourceIds).toBeUndefined();
    expect(captured.machineReads).toBe(0);
  });
});

describe("Notas: the edit panel opened from a note gets the same", () => {
  it("for a therapist", async () => {
    await render("therapist", "notas");
    expect(captured.notes).toHaveLength(1);
    expect((captured.notes[0] as NotesProps).options.tenantSharedResourceIds).toEqual(["nesa-cb"]);
  });

  it("not for reception", async () => {
    await render("reception", "notas");
    expect(captured.notes).toHaveLength(1);
    expect((captured.notes[0] as NotesProps).options.tenantSharedResourceIds).toBeUndefined();
    expect(captured.machineReads).toBe(0);
  });
});
