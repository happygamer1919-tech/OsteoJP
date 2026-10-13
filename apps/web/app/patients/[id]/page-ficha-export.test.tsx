/**
 * page-ficha-export.test.tsx: EXPORT-01. WHO SEES "Exportar ficha" ON THE
 * REGISTOS TAB, AND WHEN.
 *
 * The REAL page component renders here, on the Registos tab, with its data
 * reads replaced by stubs and its server actions by inert functions. What is
 * pinned is the page's own wiring:
 *   - the button is drawn for whoever reads clinical records (owner, admin,
 *     therapist, and a care-team therapist who only READS the ficha), when the
 *     tab lists at least one registo the file would hold;
 *   - G2: a viewer whose own read returns no registo of the patient (a patient
 *     outside their ruled scope: the tab's read is the export's read) sees the
 *     tab and NO button; reception has no Registos tab at all;
 *   - G3: a tab of drafts only shows NO button; a tab that shows a draft
 *     beside a finalized registo says the file leaves drafts out; the button
 *     is decided from every registo the viewer READS, annulled ones included,
 *     whatever "Mostrar anulados" lists, because the export answers with them;
 *   - the page hands the button the patient and nothing else (what the button
 *     then asks the server action for is ficha-export-button.test.tsx's).
 * Every "no button" arm first proves the tab rendered, so a page that failed
 * to draw can never pass as "no button".
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@osteojp/i18n";

vi.mock("server-only", () => ({}));

const PATIENT_ID = "44444444-4444-4444-8444-444444444444";
const EP_APP = "77777777-7777-4777-8777-777777777771";
const EP_IMPORTED = "77777777-7777-4777-8777-777777777776";
const TEMPLATE = "66666666-6666-4666-8666-666666666666";

const h = vi.hoisted(() => ({
  ctx: { tenantId: "11111111-1111-4111-8111-111111111111", role: "owner", userId: "22222222-2222-4222-8222-222222222222" } as {
    tenantId: string;
    role: string;
    userId: string;
  },
  /** What the narrow (write) getPatient finds: false for a care-team reader. */
  mayWrite: true,
  /** The registos the viewer's own read returns for this patient. */
  records: [] as Record<string, unknown>[],
  /** How many times the tab's read ran. */
  reads: 0,
  /** What each read asked for: annulled registos included, or not. */
  includeAnnulled: [] as boolean[],
  /** What the page handed "Exportar ficha", in render order. */
  buttonProps: [] as Record<string, unknown>[],
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
  // As the real read does: annulled registos are dropped unless asked for.
  listFichaRecords: async (_ctx: unknown, filter: { includeAnnulled?: boolean }) => {
    h.reads += 1;
    h.includeAnnulled.push(Boolean(filter.includeAnnulled));
    return filter.includeAnnulled ? h.records : h.records.filter((r) => !r.annulled);
  },
}));
vi.mock("../../../lib/clinical/episodes", () => ({ listOpenAppEpisodes: async () => [] }));
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
vi.mock("./episode-pdf-actions", () => ({
  downloadEpisodeReportUrlAction: vi.fn(),
  downloadImportedGroupReportUrlAction: vi.fn(),
}));
vi.mock("./ficha-pdf-actions", () => ({ downloadPatientFichaUrlAction: vi.fn() }));
// The REAL button, with the props the page hands it recorded on the way in.
vi.mock("./ficha-export-button", async (importOriginal) => {
  const real = await importOriginal<typeof import("./ficha-export-button")>();
  const { createElement } = await import("react");
  return {
    FichaExportButton: (props: Parameters<typeof real.FichaExportButton>[0]) => {
      h.buttonProps.push({ ...props });
      return createElement(real.FichaExportButton, props);
    },
  };
});
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
    status: "signed",
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

const inApp = { episodeId: EP_APP, episodeTitle: "Osteopatia (01/09/2026)" };
const imported = { episodeId: EP_IMPORTED, episodeTitle: "Osteopatia", episodeImported: true, status: "locked" };

/** A patient with an app episode, imported history and a registo in no episode, all finalized. */
const FINALIZED = [rec("r-app", inApp), rec("r-imp", imported), rec("r-free")];

import PatientProfilePage from "./page";

const s = getStrings("pt");
const en = getStrings("en");

async function render(
  role: string,
  records: Record<string, unknown>[],
  opts: { mayWrite?: boolean; anulados?: boolean; tab?: string } = {},
): Promise<string> {
  h.ctx = { ...h.ctx, role };
  h.mayWrite = opts.mayWrite ?? true;
  h.records = records;
  const el = await PatientProfilePage({
    params: Promise.resolve({ id: PATIENT_ID }),
    searchParams: Promise.resolve({ tab: opts.tab ?? "registos", ...(opts.anulados ? { anulados: "1" } : {}) }),
  });
  return renderToStaticMarkup(el);
}

const BUTTON = 'data-testid="ficha-export"';
const PARTIAL = 'data-testid="ficha-export-partial"';
const ROW = 'data-testid="record-row"';
const TAB_PANEL = 'id="tabpanel-registos"';
const count = (html: string, needle: string) => html.split(needle).length - 1;
const unescape = (html: string) =>
  html.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

beforeEach(() => {
  h.mayWrite = true;
  h.records = [];
  h.reads = 0;
  h.includeAnnulled = [];
  h.buttonProps = [];
});

describe("EXPORT-01: who sees 'Exportar ficha' (whoever reads clinical records)", () => {
  it.each(["owner", "admin", "therapist"] as const)("%s, on a patient whose registos they read: one button, and no 'partial' line", async (role) => {
    const html = await render(role, FINALIZED);
    // Positive control: the reader sees the registos.
    expect(count(html, ROW)).toBe(3);
    expect(count(html, BUTTON)).toBe(1);
    expect(count(html, PARTIAL)).toBe(0);
    expect(count(html, 'data-testid="ficha-export-error"')).toBe(0);
  });

  it("a CARE-TEAM therapist (reads the ficha, writes nothing here): the button, and no 'Nova ficha'", async () => {
    const html = await render("therapist", FINALIZED, { mayWrite: false });
    expect(count(html, ROW)).toBe(3);
    expect(count(html, BUTTON)).toBe(1);
    expect(unescape(html)).not.toContain(`/clinical/new?patientId=${PATIENT_ID}`);
  });

  it("the button says 'Exportar ficha', and the page hands it the patient and nothing of a registo", async () => {
    const html = unescape(await render("owner", FINALIZED));
    const at = html.indexOf(BUTTON);
    const button = html.slice(html.lastIndexOf("<button", at), html.indexOf("</button>", at));
    expect(button).toContain("Exportar ficha");
    expect(button).toContain('type="button"');
    expect(h.buttonProps).toEqual([
      { patientId: PATIENT_ID, label: "Exportar ficha", errorLabel: s["clinical.downloadPdfError"] },
    ]);
  });

  it("the tab's read is not run a second time for the button: ONE read, annulled registos included, whatever the toggle says", async () => {
    await render("owner", FINALIZED);
    expect(h.reads).toBe(1);
    await render("owner", FINALIZED, { anulados: true });
    expect(h.reads).toBe(2);
    expect(h.includeAnnulled).toEqual([true, true]);
  });

  it("it is on the Registos tab only: another tab of the same patient draws none", async () => {
    const html = await render("owner", FINALIZED, { tab: "resumo" });
    expect(html).toContain("Zzz Paciente Render Teste");
    expect(count(html, BUTTON)).toBe(0);
    expect(h.buttonProps).toEqual([]);
  });
});

describe("EXPORT-01, G2: no action for a viewer outside the ruled scope", () => {
  it.each(["owner", "admin", "therapist"] as const)(
    "%s, on a patient of whom their own read returns no registo: the tab renders, empty, with NO button",
    async (role) => {
      const html = await render(role, []);
      expect(count(html, TAB_PANEL)).toBe(1);
      expect(unescape(html)).toContain(s["patients.emptyRecordsTitle"]);
      expect(count(html, ROW)).toBe(0);
      expect(count(html, BUTTON)).toBe(0);
      expect(h.buttonProps).toEqual([]);
    },
  );

  it("RECEPTION: no Registos tab, so no button (the page renders, with the patient's name), and the tab's read never runs", async () => {
    const html = await render("reception", FINALIZED);
    expect(html).toContain("Zzz Paciente Render Teste");
    expect(count(html, TAB_PANEL)).toBe(0);
    expect(count(html, ROW)).toBe(0);
    expect(count(html, BUTTON)).toBe(0);
    expect(h.buttonProps).toEqual([]);
    expect(h.reads).toBe(0);
  });
});

describe("EXPORT-01, G3: drafts and annulled registos on the tab", () => {
  it("a tab of DRAFTS ONLY: the registos render, NO button, no 'partial' line", async () => {
    const html = await render("owner", [rec("d1", { ...inApp, status: "draft" }), rec("d2", { status: "draft" })]);
    expect(count(html, ROW)).toBe(2);
    expect(count(html, BUTTON)).toBe(0);
    expect(count(html, PARTIAL)).toBe(0);
  });

  it("a finalized registo and a draft: the button, and the line saying drafts stay out of the file", async () => {
    const html = await render("owner", [rec("r-app", inApp), rec("d-free", { status: "draft" })]);
    expect(count(html, ROW)).toBe(2);
    expect(count(html, BUTTON)).toBe(1);
    expect(count(html, PARTIAL)).toBe(1);
    expect(unescape(html)).toContain(s["patients.fichaExportPartial"]);
  });

  it("an ANNULLED registo shown beside a finalized one ('Mostrar anulados'): the button, and no 'partial' line, because the file holds it", async () => {
    const html = await render("owner", [rec("r-app", inApp), rec("r-annulled", { annulled: true })], { anulados: true });
    expect(count(html, ROW)).toBe(2);
    expect(html).toContain('data-annulled="true"');
    expect(count(html, BUTTON)).toBe(1);
    expect(count(html, PARTIAL)).toBe(0);
  });

  it("a patient whose only finalized registo is ANNULLED: the button is there with the registo hidden and with it listed, because the export answers with it, marked", async () => {
    const only = [rec("r-annulled", { annulled: true })];
    // Hidden by default, as every annulled registo is: nothing listed. The
    // button is drawn all the same.
    const hidden = await render("owner", only);
    expect(count(hidden, TAB_PANEL)).toBe(1);
    expect(count(hidden, ROW)).toBe(0);
    expect(count(hidden, BUTTON)).toBe(1);
    expect(count(hidden, PARTIAL)).toBe(0);
    const shown = await render("owner", only, { anulados: true });
    expect(count(shown, ROW)).toBe(1);
    expect(count(shown, BUTTON)).toBe(1);
    expect(count(shown, PARTIAL)).toBe(0);
  });

  it("a hidden annulled registo beside a DRAFT on the tab: the button, and the line saying drafts stay out of the file", async () => {
    const html = await render("owner", [rec("r-annulled", { annulled: true }), rec("d-free", { status: "draft" })]);
    expect(count(html, ROW)).toBe(1);
    expect(html).not.toContain('data-annulled="true"');
    expect(count(html, BUTTON)).toBe(1);
    expect(count(html, PARTIAL)).toBe(1);
  });

  it("an annulled DRAFT, hidden, beside a finalized registo: no 'partial' line, which speaks only of what the tab lists", async () => {
    const records = [rec("r-app", inApp), rec("d-annulled", { status: "draft", annulled: true })];
    const hidden = await render("owner", records);
    expect(count(hidden, ROW)).toBe(1);
    expect(count(hidden, BUTTON)).toBe(1);
    expect(count(hidden, PARTIAL)).toBe(0);
    const shown = await render("owner", records, { anulados: true });
    expect(count(shown, ROW)).toBe(2);
    expect(count(shown, PARTIAL)).toBe(1);
  });

  it("DRAFTS ONLY, one of them annulled and hidden: still NO button", async () => {
    const html = await render("owner", [rec("d1", { status: "draft" }), rec("d2", { status: "draft", annulled: true })]);
    expect(count(html, ROW)).toBe(1);
    expect(count(html, BUTTON)).toBe(0);
  });
});

describe("EXPORT-01: the strings, in both languages", () => {
  it("the button and the 'partial' line", () => {
    expect(s["patients.fichaExport"]).toBe("Exportar ficha");
    expect(en["patients.fichaExport"]).toBe("Export patient record");
    expect(s["patients.fichaExportPartial"]).toBe(
      "O PDF da ficha inclui só os registos finalizados. Os rascunhos ficam de fora.",
    );
    expect(en["patients.fichaExportPartial"]).toBe(
      "The patient record PDF includes finalized records only. Drafts are left out.",
    );
    // The error line is the per-record button's own.
    expect(s["clinical.downloadPdfError"]).toBe("Não foi possível gerar o PDF.");
  });
});
