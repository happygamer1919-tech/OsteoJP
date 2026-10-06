/**
 * page-add-evaluation.test.tsx: EPI-01b, R4 round 1 on #1526. WHO SEES
 * "+ Avaliação" ON THE REGISTOS TAB, AND WHAT THE TAB SAYS WHEN ONE FILED NOTHING.
 *
 * The REAL page component renders here, on the Registos tab, with its data
 * reads replaced by stubs and its server actions by inert functions. What is
 * pinned is the page's own wiring, which the e2e cannot reach for every role:
 *   - the gate is `canStartEpisode`: an author (owner or therapist) who may
 *     WRITE for the patient. A care-team therapist READS the ficha (getPatient
 *     with access "read" finds the patient) but neither treats nor created
 *     them (the narrow getPatient finds nothing): the groups render, and no
 *     group has the button. The treating therapist and the owner do have it;
 *     an admin reads the groups without it;
 *   - each group's form posts what addEvaluationTarget decides: its own app
 *     episode, or an imported group's specialty and NO episode id (the server
 *     reuses the patient's open app episode of it or opens one, ruling R31, so
 *     the label promises neither); "Sem episódio" has none;
 *   - each refusal the action can send back (m=episodeMismatch,
 *     m=episodeClosed, m=avaliacaoErr) renders its own pt-PT alert, and an
 *     unrelated m renders none.
 * Every "no button" arm first proves the groups rendered, so an empty tab can
 * never pass as "no button".
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@osteojp/i18n";

vi.mock("server-only", () => ({}));

const PATIENT_ID = "44444444-4444-4444-8444-444444444444";
const EP_APP = "77777777-7777-4777-8777-777777777771";
const EP_IMPORTED = "77777777-7777-4777-8777-777777777772";
const TEMPLATE = "66666666-6666-4666-8666-666666666666";

const h = vi.hoisted(() => ({
  ctx: { tenantId: "11111111-1111-4111-8111-111111111111", role: "therapist", userId: "22222222-2222-4222-8222-222222222222" } as {
    tenantId: string;
    role: string;
    userId: string;
  },
  /** What the narrow (write) getPatient finds: false for a care-team reader. */
  mayWrite: true,
}));

class NotFound extends Error {}

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("NOT_FOUND");
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
  fullName: "Zzz Paciente Render Teste",
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
  runScoped: vi.fn(),
}));
vi.mock("../../../lib/patients/queries", () => ({
  getPatient: async (_id: string, opts: { access?: string } = {}) =>
    opts.access === "read" || h.mayWrite ? patient : null,
  getPatientHardDeleteBlockers: async () => ({ hasClinicalRecords: true, hasOtherReferences: false, counts: [] }),
}));
vi.mock("../../../lib/patients/rgpd-acceptance", () => ({ getLatestRgpdAcceptance: async () => ({ id: "x" }) }));
vi.mock("../../../lib/clinical/ficha-groups", () => ({
  listFichaRecords: async () => [
    rec("r-app", { episodeId: EP_APP, episodeTitle: "Episódio (15/09/2026)", createdAt: "2026-09-15T09:30:00.000Z" }),
    rec("r-imp", { episodeId: EP_IMPORTED, episodeTitle: "Osteopatia", episodeImported: true, status: "locked", createdAt: "2024-05-10T23:00:00.000Z" }),
    rec("r-free", { createdAt: "2026-08-20T10:00:00.000Z" }),
  ],
}));
vi.mock("../../../lib/clinical/records", () => ({
  listActiveTemplates: async () => [{ id: TEMPLATE, key: "ficha_medica", title: null, version: 1 }],
}));
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
vi.mock("../../../lib/patients/actions", () => ({
  softDeletePatientAction: vi.fn(),
  restorePatientAction: vi.fn(),
  hardDeletePatientAction: vi.fn(),
  preflightHardDeleteAction: vi.fn(),
  searchPatientsAction: vi.fn(),
}));

function rec(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    status: "draft",
    version: 1,
    supersedesId: null,
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-10-02T09:00:00.000Z",
    annulled: false,
    templateTitle: null,
    episodeId: null,
    episodeTitle: null,
    episodeImported: false,
    excerpt: null,
    ...over,
  };
}

import PatientProfilePage from "./page";

const s = getStrings("pt");
const en = getStrings("en");

async function render(role: string, opts: { mayWrite?: boolean; m?: string } = {}): Promise<string> {
  h.ctx = { ...h.ctx, role };
  h.mayWrite = opts.mayWrite ?? true;
  const el = await PatientProfilePage({
    params: Promise.resolve({ id: PATIENT_ID }),
    searchParams: Promise.resolve({ tab: "registos", ...(opts.m ? { m: opts.m } : {}) }),
  });
  return renderToStaticMarkup(el);
}

/** The HTML of each record group, keyed by its data-group-key. */
function groups(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = html.split('data-testid="record-group"').slice(1);
  for (const part of parts) {
    const key = /data-group-key="([^"]+)"/.exec(part)?.[1];
    if (key) out[key] = part.split("</details>")[0]!;
  }
  return out;
}

const BUTTON = 'data-testid="record-group-add-evaluation"';
const count = (html: string, needle: string) => html.split(needle).length - 1;
const unescape = (html: string) =>
  html.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

beforeEach(() => {
  h.mayWrite = true;
});

describe("EPI-01b: who sees '+ Avaliação' (the page's gate, canStartEpisode)", () => {
  it("the TREATING therapist: one button on the app episode and one on the imported group, none on 'Sem episódio'", async () => {
    const g = groups(await render("therapist"));
    expect(Object.keys(g).sort()).toEqual([`episode:${EP_APP}`, "imported:Osteopatia", "none"].sort());
    expect(count(g[`episode:${EP_APP}`]!, BUTTON)).toBe(1);
    expect(count(g["imported:Osteopatia"]!, BUTTON)).toBe(1);
    expect(count(g["none"]!, BUTTON)).toBe(0);
  });

  it("what each form posts: its own app episode; the imported group's specialty and no episode; the template; from=ficha", async () => {
    const g = groups(await render("therapist"));
    const app = g[`episode:${EP_APP}`]!;
    expect(app).toContain(`name="episodeId" value="${EP_APP}"`);
    expect(app).not.toContain('name="newEpisodeSpecialty"');
    expect(app).toContain(`name="formTemplateId" value="${TEMPLATE}"`);
    expect(app).toContain(`name="patientId" value="${PATIENT_ID}"`);
    expect(app).toContain('name="from" value="ficha"');
    const imp = g["imported:Osteopatia"]!;
    expect(imp).toContain('name="newEpisodeSpecialty" value="Osteopatia"');
    expect(imp).not.toContain('name="episodeId"');
    expect(imp).not.toContain(EP_IMPORTED);
    expect(unescape(app)).toContain('aria-label="Nova avaliação neste episódio: Episódio (15/09/2026)"');
    // R31: the server reuses the open episode or opens one, so the label says
    // both and is true either way; it never promises "a new episode".
    expect(unescape(imp)).toContain('aria-label="Nova avaliação de Osteopatia, no episódio aberto ou num novo"');
    expect(unescape(imp)).not.toContain("num novo episódio de");
    expect(en["patients.fichaGroupAddEvaluationOpenOrNewEpisode"]).toBe(
      "New {group} evaluation, in the open episode or a new one",
    );
  });

  it("a CARE-TEAM therapist (reads the ficha, neither treats nor created the patient): the groups render, no button anywhere", async () => {
    const html = await render("therapist", { mayWrite: false });
    const g = groups(html);
    // Positive control: the reader really sees every group and registo.
    expect(Object.keys(g)).toHaveLength(3);
    expect(count(html, 'data-testid="record-row"')).toBe(3);
    expect(count(html, BUTTON)).toBe(0);
    expect(html).not.toContain(s["clinical.new"]);
  });

  it("the OWNER: the same two buttons as the treating therapist", async () => {
    const g = groups(await render("owner"));
    expect(count(g[`episode:${EP_APP}`]!, BUTTON)).toBe(1);
    expect(count(g["imported:Osteopatia"]!, BUTTON)).toBe(1);
    expect(count(g["none"]!, BUTTON)).toBe(0);
  });

  it("an ADMIN (reads clinical, authors nothing): the groups render, no button", async () => {
    const html = await render("admin");
    expect(Object.keys(groups(html))).toHaveLength(3);
    expect(count(html, BUTTON)).toBe(0);
  });

  it("RECEPTION: no Registos tab, so no groups and no button (the page renders, with the patient's name)", async () => {
    const html = await render("reception");
    expect(html).toContain("Zzz Paciente Render Teste");
    expect(count(html, 'data-testid="record-group"')).toBe(0);
    expect(count(html, BUTTON)).toBe(0);
  });
});

describe("EPI-01b: the alert a refused '+ Avaliação' lands on", () => {
  const ALERT = 'data-testid="add-evaluation-error"';

  it.each([
    ["episodeMismatch", "clinical.episodeMismatch"],
    ["episodeClosed", "clinical.episodeClosedRefused"],
    ["avaliacaoErr", "patients.fichaGroupAddEvaluationError"],
  ] as const)("m=%s renders its own pt-PT alert, once, with role=alert", async (m, key) => {
    const html = await render("therapist", { m });
    expect(count(html, ALERT)).toBe(1);
    // The whole <p> element that carries the test id.
    const at = html.indexOf(ALERT);
    const alert = html.slice(html.lastIndexOf("<p", at), html.indexOf("</p>", at));
    expect(alert).toContain('role="alert"');
    expect(unescape(alert)).toContain(s[key]);
    // The groups still render beneath it.
    expect(Object.keys(groups(html))).toHaveLength(3);
  });

  it("the strings are the ones the PR names", () => {
    expect(s["clinical.episodeMismatch"]).toBe("O episódio escolhido não pertence a este paciente. O registo não foi criado.");
    expect(s["clinical.episodeClosedRefused"]).toBe("O episódio escolhido está fechado. O registo não foi criado.");
    expect(s["patients.fichaGroupAddEvaluationError"]).toBe("Não foi possível iniciar a avaliação.");
  });

  it("no m, or an unrelated one, renders no alert", async () => {
    expect(count(await render("therapist"), ALERT)).toBe(0);
    expect(count(await render("therapist", { m: "episodeErr" }), ALERT)).toBe(0);
  });
});
