/**
 * page-age-lisbon-date.test.tsx: the age on a patient's record counts on the
 * LISBON calendar date, whatever zone the server runs in.
 *
 * The REAL page component renders here, with its data reads replaced by stubs
 * (the harness of page-survey-switch.test.tsx), and the age is read off the
 * identity line under the patient's name ("26 anos · NIF ...").
 *
 * Before this change the page counted the age from the server's own clock and
 * zone. On Vercel that is UTC, and in summer time Lisbon is UTC+1, so between
 * 00:00 and 01:00 Lisbon on a birthday the record still showed the age before
 * it. In a zone west of UTC the birth date itself (read as UTC midnight) fell
 * on the day before, and the record showed the new age a day early. R52 fixed
 * the same fault in Indicadores (#1694); the page now uses that same helper,
 * `ageInYears` in lib/statistics/kpi-transform.ts.
 *
 * Every case runs in three server zones: UTC (Vercel), America/Toronto (west
 * of UTC) and Asia/Tokyo (east of Lisbon). The answer must not move. Each zone
 * block first proves the zone really took effect, so a zone switch that did
 * nothing cannot pass as three identical runs.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@osteojp/i18n";

vi.mock("server-only", () => ({}));

const PATIENT_ID = "5555aaaa-5555-4555-8555-55555555bbbb";

const h = vi.hoisted(() => ({
  ctx: { tenantId: "11111111-1111-4111-8111-111111111111", role: "reception", userId: "22222222-2222-4222-8222-222222222222" } as {
    tenantId: string;
    role: string;
    userId: string;
  },
  dateOfBirth: null as string | null,
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

function patient() {
  return {
    id: PATIENT_ID,
    fullName: "Zzz Paciente Idade Teste",
    mergedIntoId: null,
    deletedAt: null,
    primaryLocationId: null,
    dateOfBirth: h.dateOfBirth,
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
}

vi.mock("../../../lib/auth/context", () => ({
  getRequestContext: async () => h.ctx,
  requireRequestContext: async () => h.ctx,
  runScoped: async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [] }),
        }),
      }),
    }),
}));
vi.mock("../../../lib/surveys/survey-list", () => ({
  listSurveySends: async () => ({ rows: [], total: 0, page: 1, pageSize: 50, pageCount: 1 }),
}));
vi.mock("../../../lib/patients/queries", () => ({
  getPatient: async () => patient(),
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
const NIF_LABEL = `${s["patients.fieldNif"]} 999000111`;

/**
 * The age the record shows for `dateOfBirth` at the instant `nowIso`, or null
 * when the identity line carries no age. The identity line is found by its NIF
 * part, which this patient always has, so "no age" is told apart from "no line".
 */
async function ageShown(dateOfBirth: string | null, nowIso: string): Promise<number | null> {
  h.dateOfBirth = dateOfBirth;
  vi.setSystemTime(new Date(nowIso));
  const el = await PatientProfilePage({
    params: Promise.resolve({ id: PATIENT_ID }),
    searchParams: Promise.resolve({}),
  });
  const html = renderToStaticMarkup(el);
  const line = html.split("<p").find((p) => p.includes(NIF_LABEL));
  expect(line, "the identity line rendered").toBeDefined();
  const m = new RegExp(`(-?\\d+) ${s["patients.ageSuffix"]}`).exec(line!);
  return m ? Number(m[1]) : null;
}

const savedTz = process.env.TZ;
afterAll(() => {
  if (savedTz === undefined) delete process.env.TZ;
  else process.env.TZ = savedTz;
});
beforeEach(() => {
  // Only Date is faked: the page awaits real promises.
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

/** Offset in minutes (Date#getTimezoneOffset) each zone has in mid-July 2026. */
const ZONES = [
  ["UTC", 0],
  ["America/Toronto", 240],
  ["Asia/Tokyo", -540],
] as const;

describe.each(ZONES)("with the server in %s", (zone, julyOffset) => {
  beforeAll(() => {
    process.env.TZ = zone;
  });

  it("GUARD: the zone switch took effect", () => {
    expect(new Date("2026-07-15T12:00:00.000Z").getTimezoneOffset()).toBe(julyOffset);
  });

  it("summer: 00:30 Lisbon on the birthday (23:30 UTC the day before) shows the new age", async () => {
    // 2026-07-16 00:30 WEST (UTC+1) is 2026-07-15 23:30 UTC.
    expect(await ageShown("2000-07-16", "2026-07-15T23:30:00.000Z")).toBe(26);
  });

  it("summer: 23:30 Lisbon on the day before the birthday still shows the old age", async () => {
    // 2026-07-15 23:30 WEST is 2026-07-15 22:30 UTC.
    expect(await ageShown("2000-07-16", "2026-07-15T22:30:00.000Z")).toBe(25);
  });

  it("summer: midday in Lisbon on the day before the birthday still shows the old age", async () => {
    expect(await ageShown("2000-07-16", "2026-07-15T11:00:00.000Z")).toBe(25);
  });

  it("winter: Lisbon is UTC+0, so the birthday starts at 00:00 UTC", async () => {
    expect(await ageShown("2000-01-16", "2026-01-15T23:30:00.000Z")).toBe(25);
    expect(await ageShown("2000-01-16", "2026-01-16T00:30:00.000Z")).toBe(26);
  });

  it("a record with no date of birth shows no age, and the line still renders", async () => {
    expect(await ageShown(null, "2026-07-15T23:30:00.000Z")).toBeNull();
  });
});
