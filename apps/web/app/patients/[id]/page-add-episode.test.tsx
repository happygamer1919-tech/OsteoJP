/**
 * page-add-episode.test.tsx: EPI-01b, piece 2. "+ Episódio" ON THE REGISTOS TAB:
 * WHO SEES IT, WHAT ITS FORM CAN POST, AND WHAT THE TAB SHOWS AFTERWARDS.
 *
 * The REAL page component renders here, on the Registos tab, with its data
 * reads replaced by stubs and its server actions by inert functions (the same
 * harness as page-add-evaluation.test.tsx). What is pinned is the page's own
 * wiring:
 *   - the control is drawn for a THERAPIST WHO MAY WRITE for the patient and
 *     for nobody else: not the owner, not an admin, not reception, not a
 *     care-team therapist who only reads. (createEpisode refuses them on the
 *     server as well: episodes.create-guard.test.ts.) The old "Novo episódio"
 *     button in the header is gone, so there is one entry point;
 *   - the form can post a patient and a specialty from the closed list, and
 *     nothing else: it has no text field of any kind. The title is a specialty
 *     and a date, by ruling;
 *   - an open episode with no registo yet is a group of its own, with
 *     "+ Avaliação" filing in it, for a viewer who may write;
 *   - landing on `episodio=<id>` names the new episode; landing on
 *     `m=episodioAberto` shows the episode already open (R31's choice, the most
 *     recently opened) and a confirmation that names it; `m=episodeErr` says
 *     nothing was opened.
 * Every "not drawn" arm first proves the tab rendered.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@osteojp/i18n";

vi.mock("server-only", () => ({}));

const TENANT = "11111111-1111-4111-8111-111111111111";
const PATIENT_ID = "4444aaaa-4444-4444-8444-44444444bbbb";
const EP_APP = "7777cccc-7777-4777-8777-777777777771"; // an app episode holding a registo
const EP_EMPTY_NEW = "7777cccc-7777-4777-8777-777777777772"; // open, no registo, opened last
const EP_EMPTY_OLD = "7777cccc-7777-4777-8777-777777777773"; // open, no registo, opened first
const TEMPLATE = "66666666-6666-4666-8666-666666666666";

type OpenEpisode = {
  id: string;
  tenantId: string;
  patientId: string;
  status: string;
  title: string;
  openedAt: Date;
  imported: boolean;
  empty: boolean;
};

const h = vi.hoisted(() => ({
  ctx: { tenantId: "11111111-1111-4111-8111-111111111111", role: "therapist", userId: "22222222-2222-4222-8222-222222222222" } as {
    tenantId: string;
    role: string;
    userId: string;
  },
  /** What the narrow (write) getPatient finds: false for a care-team reader. */
  mayWrite: true,
  records: [] as Record<string, unknown>[],
  openEpisodes: [] as unknown[],
  listOpenAppEpisodes: vi.fn(),
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
  fullName: "Zzz Paciente Episodio Teste",
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
vi.mock("../../../lib/clinical/ficha-groups", () => ({ listFichaRecords: async () => h.records }));
vi.mock("../../../lib/clinical/episodes", () => ({ listOpenAppEpisodes: h.listOpenAppEpisodes }));
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
const open = (id: string, title: string, openedAt: string, empty: boolean): OpenEpisode => ({
  id,
  tenantId: TENANT,
  patientId: PATIENT_ID,
  status: "open",
  title,
  openedAt: new Date(openedAt),
  imported: false,
  empty,
});

/** One registo in an app episode, one imported group, one registo with no episode. */
const THREE_GROUPS = [
  rec("r-app", { episodeId: EP_APP, episodeTitle: "Osteopatia (15/09/2026)", createdAt: "2026-09-15T09:30:00.000Z" }),
  rec("r-imp", { episodeId: "7777cccc-7777-4777-8777-77777777777f", episodeTitle: "Osteopatia", episodeImported: true, status: "locked", createdAt: "2024-05-10T23:00:00.000Z" }),
  rec("r-free", { createdAt: "2026-08-20T10:00:00.000Z" }),
];
const APP_OPEN = open(EP_APP, "Osteopatia (15/09/2026)", "2026-09-15T09:00:00.000Z", false);
const EMPTY_NEW = open(EP_EMPTY_NEW, "Osteopatia (05/10/2026)", "2026-10-05T10:00:00.000Z", true);
const EMPTY_OLD = open(EP_EMPTY_OLD, "Fisioterapia (01/10/2026)", "2026-10-01T10:00:00.000Z", true);

import PatientProfilePage from "./page";

const s = getStrings("pt");
const en = getStrings("en");

async function render(
  role: string,
  opts: { mayWrite?: boolean; m?: string; esp?: string; episodio?: string } = {},
): Promise<string> {
  h.ctx = { ...h.ctx, role };
  h.mayWrite = opts.mayWrite ?? true;
  const query: Record<string, string> = { tab: "registos" };
  for (const key of ["m", "esp", "episodio"] as const) {
    const value = opts[key];
    if (value !== undefined) query[key] = value;
  }
  const el = await PatientProfilePage({
    params: Promise.resolve({ id: PATIENT_ID }),
    searchParams: Promise.resolve(query),
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

/** The whole element (`<tag ...>...</tag>`) that carries a test id, or null. */
function element(html: string, testId: string, tag: string): string | null {
  const at = html.indexOf(`data-testid="${testId}"`);
  if (at === -1) return null;
  const start = html.lastIndexOf(`<${tag}`, at);
  const end = html.indexOf(`</${tag}>`, at);
  return html.slice(start, end + tag.length + 3);
}

const FORM = 'data-testid="add-episode-form"';
const ADD_EVALUATION = 'data-testid="record-group-add-evaluation"';
const count = (html: string, needle: string) => html.split(needle).length - 1;
const unescape = (html: string) =>
  html.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

beforeEach(() => {
  h.mayWrite = true;
  h.records = THREE_GROUPS;
  h.openEpisodes = [APP_OPEN];
  h.listOpenAppEpisodes.mockReset();
  h.listOpenAppEpisodes.mockImplementation(async () => h.openEpisodes);
});

describe("EPI-01b piece 2: who sees '+ Episódio'", () => {
  it("the TREATING therapist: one form, on the Registos tab, and no 'Novo episódio' in the header", async () => {
    const html = await render("therapist");
    expect(count(html, FORM)).toBe(1);
    const panel = html.slice(html.indexOf('id="tabpanel-registos"'));
    expect(count(panel, FORM)).toBe(1);
    expect(html).not.toContain("Novo episódio");
    expect(h.listOpenAppEpisodes).toHaveBeenCalledWith(expect.objectContaining({ role: "therapist" }), PATIENT_ID);
  });

  it.each([["owner"], ["admin"]] as const)("the %s: the groups render, no '+ Episódio'", async (role) => {
    const html = await render(role);
    expect(Object.keys(groups(html))).toHaveLength(3);
    expect(count(html, FORM)).toBe(0);
    expect(html).not.toContain(s["patients.fichaAddEpisodeSpecialty"]);
  });

  it("a CARE-TEAM therapist (reads the ficha, may not write for the patient): the groups render, no '+ Episódio', and the open episodes are not read", async () => {
    const html = await render("therapist", { mayWrite: false });
    expect(Object.keys(groups(html))).toHaveLength(3);
    expect(count(html, FORM)).toBe(0);
    expect(h.listOpenAppEpisodes).not.toHaveBeenCalled();
  });

  it("RECEPTION: the page renders with the patient's name, no Registos tab and no '+ Episódio'", async () => {
    const html = await render("reception");
    expect(html).toContain("Zzz Paciente Episodio Teste");
    expect(count(html, 'data-testid="record-group"')).toBe(0);
    expect(count(html, FORM)).toBe(0);
    expect(h.listOpenAppEpisodes).not.toHaveBeenCalled();
  });

  it("an ADMIN does not have the open episodes read for them either", async () => {
    await render("admin");
    expect(h.listOpenAppEpisodes).not.toHaveBeenCalled();
  });

  it("a patient with no registo and no episode: the empty state, and the therapist still has the control", async () => {
    h.records = [];
    h.openEpisodes = [];
    const html = await render("therapist");
    expect(html).toContain(s["patients.emptyRecordsTitle"]);
    expect(count(html, FORM)).toBe(1);
  });
});

describe("EPI-01b piece 2: what the form can post", () => {
  it("the patient, and a specialty from the closed list; a required choice with no default", async () => {
    const form = element(await render("therapist"), "add-episode-form", "form")!;
    expect(form).toContain(`name="patientId" value="${PATIENT_ID}"`);
    const select = /<select[^>]*name="specialty"[^>]*>[\s\S]*?<\/select>/.exec(form)?.[0] ?? "";
    expect(select).not.toBe("");
    expect(select).toMatch(/<select[^>]*\brequired\b/);
    const options = [...select.matchAll(/<option([^>]*)>([^<]*)<\/option>/g)].map((o) => ({
      value: /value="([^"]*)"/.exec(o[1]!)?.[1],
      disabled: /\bdisabled\b/.test(o[1]!),
      selected: /\bselected\b/.test(o[1]!),
      text: o[2],
    }));
    expect(options).toEqual([
      { value: "", disabled: true, selected: true, text: s["patients.fichaAddEpisodeChoose"] },
      { value: "Osteopatia", disabled: false, selected: false, text: "Osteopatia" },
      { value: "Fisioterapia", disabled: false, selected: false, text: "Fisioterapia" },
    ]);
  });

  it("NO text can be typed into it: its only fields are the hidden patient and the specialty select", async () => {
    const form = element(await render("therapist"), "add-episode-form", "form")!;
    expect(form).not.toContain("<textarea");
    const inputs = [...form.matchAll(/<input([^>]*)>/g)].map((i) => i[1]!);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toContain('type="hidden"');
    expect(inputs[0]).toContain('name="patientId"');
    const names = [...form.matchAll(/\bname="([^"]+)"/g)].map((n) => n[1]);
    expect(names.sort()).toEqual(["patientId", "specialty"]);
    expect(form).not.toContain('contenteditable');
  });

  it("the button reads '+ Episódio' (a plus icon and the word), with a full name for a screen reader; the select has a visible label", async () => {
    const html = await render("therapist");
    const button = element(html, "add-episode-submit", "button")!;
    expect(button).toContain('type="submit"');
    expect(button).toContain("<svg");
    expect(button.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "").trim()).toBe("Episódio");
    expect(unescape(button)).toContain('aria-label="Abrir um novo episódio da especialidade escolhida"');
    const form = element(html, "add-episode-form", "form")!;
    const label = /<label[^>]*for="([^"]+)"[^>]*>([\s\S]*?)<\/label>/.exec(form);
    expect(label, "the select has a <label for>").not.toBeNull();
    expect(label![2]).toContain("Especialidade do novo episódio");
    expect(form).toMatch(new RegExp(`<select[^>]*id="${label![1]}"`));
  });

  it("the strings, in pt and en", () => {
    expect(s["patients.fichaAddEpisode"]).toBe("Episódio");
    expect(s["patients.fichaAddEpisodeSpecialty"]).toBe("Especialidade do novo episódio");
    expect(s["patients.fichaAddEpisodeChoose"]).toBe("Escolher especialidade");
    expect(s["patients.fichaAddEpisodeOpened"]).toBe("Episódio aberto: {title}. Pode registar a primeira avaliação.");
    expect(s["patients.fichaAddEpisodeExistsTitle"]).toBe("Já existe um episódio de {specialty} aberto");
    expect(s["patients.fichaAddEpisodeExistsBody"]).toBe("Episódio aberto: {title}. Não foi aberto nenhum episódio novo.");
    expect(s["patients.fichaAddEpisodeExistsView"]).toBe("Ver o episódio aberto");
    expect(s["patients.fichaAddEpisodeExistsConfirm"]).toBe("Abrir outro episódio de {specialty}");
    expect(s["patients.fichaGroupCountNone"]).toBe("Sem avaliações");
    expect(s["patients.episodeError"]).toBe("Não foi possível criar o episódio.");
    expect(en["patients.fichaAddEpisode"]).toBe("Episode");
    expect(en["patients.fichaAddEpisodeSpecialty"]).toBe("Specialty of the new episode");
    expect(en["patients.fichaAddEpisodeChoose"]).toBe("Choose a specialty");
    expect(en["patients.fichaAddEpisodeAria"]).toBe("Open a new episode of the chosen specialty");
    expect(en["patients.fichaAddEpisodeOpened"]).toBe("Episode opened: {title}. You can file the first evaluation.");
    expect(en["patients.fichaAddEpisodeExistsTitle"]).toBe("There is already an open {specialty} episode");
    expect(en["patients.fichaAddEpisodeExistsBody"]).toBe("Open episode: {title}. No new episode was opened.");
    expect(en["patients.fichaAddEpisodeExistsView"]).toBe("View the open episode");
    expect(en["patients.fichaAddEpisodeExistsConfirm"]).toBe("Open another {specialty} episode");
    expect(en["patients.fichaGroupCountNone"]).toBe("No evaluations");
  });
});

describe("EPI-01b piece 2: an open episode with no registo yet is a group, with '+ Avaliação' at hand", () => {
  beforeEach(() => {
    h.openEpisodes = [EMPTY_NEW, EMPTY_OLD, APP_OPEN];
  });

  it("the therapist: each empty episode is a group titled as the episode is, with no rows, 'Sem avaliações', and '+ Avaliação' filing in it", async () => {
    const html = await render("therapist");
    const g = groups(html);
    expect(Object.keys(g)).toEqual([
      `episode:${EP_EMPTY_NEW}`,
      `episode:${EP_EMPTY_OLD}`,
      `episode:${EP_APP}`,
      "imported:Osteopatia",
      "none",
    ]);
    const fresh = g[`episode:${EP_EMPTY_NEW}`]!;
    expect(fresh).toContain("Osteopatia (05/10/2026)");
    expect(fresh).toContain("05/10/2026</span>");
    expect(fresh).toContain(s["patients.fichaGroupCountNone"]);
    expect(count(fresh, 'data-testid="record-row"')).toBe(0);
    expect(count(fresh, ADD_EVALUATION)).toBe(1);
    expect(fresh).toContain(`name="episodeId" value="${EP_EMPTY_NEW}"`);
    expect(fresh).not.toContain('name="newEpisodeSpecialty"');
    expect(unescape(fresh)).toContain('aria-label="Nova avaliação neste episódio: Osteopatia (05/10/2026)"');
    // The episode that holds a registo keeps its one group and its row.
    expect(count(g[`episode:${EP_APP}`]!, 'data-testid="record-row"')).toBe(1);
    expect(g[`episode:${EP_APP}`]!).toContain(s["patients.fichaGroupCountOne"]);
  });

  it("the OWNER (an author) sees the same groups and '+ Avaliação', and still no '+ Episódio'", async () => {
    const html = await render("owner");
    const g = groups(html);
    expect(count(g[`episode:${EP_EMPTY_NEW}`]!, ADD_EVALUATION)).toBe(1);
    expect(count(html, FORM)).toBe(0);
  });

  it("with only empty open episodes and no registo: the groups are drawn, not the empty state", async () => {
    h.records = [];
    h.openEpisodes = [EMPTY_NEW];
    const html = await render("therapist");
    expect(Object.keys(groups(html))).toEqual([`episode:${EP_EMPTY_NEW}`]);
    expect(html).not.toContain(s["patients.emptyRecordsTitle"]);
  });
});

describe("EPI-01b piece 2: where '+ Episódio' lands", () => {
  const OPENED = 'data-testid="add-episode-opened"';
  const CONFIRM = 'data-testid="add-episode-confirm"';
  const ERROR = 'data-testid="add-episode-error"';

  beforeEach(() => {
    h.openEpisodes = [EMPTY_NEW, EMPTY_OLD, APP_OPEN];
  });

  it("episodio=<the new episode>: a status line naming it, once, and its group carries the id the focus moves to", async () => {
    const html = await render("therapist", { episodio: EP_EMPTY_NEW });
    expect(count(html, OPENED)).toBe(1);
    const status = element(html, "add-episode-opened", "p")!;
    expect(status).toContain('role="status"');
    expect(unescape(status)).toContain("Episódio aberto: Osteopatia (05/10/2026). Pode registar a primeira avaliação.");
    expect(html).toContain(`id="episodio-${EP_EMPTY_NEW}"`);
    expect(html).toMatch(new RegExp(`<summary[^>]*id="episodio-${EP_EMPTY_NEW}-resumo"`));
  });

  it("the id in UPPERCASE names the same episode", async () => {
    expect(EP_EMPTY_NEW.toUpperCase()).not.toBe(EP_EMPTY_NEW);
    expect(count(await render("therapist", { episodio: EP_EMPTY_NEW.toUpperCase() }), OPENED)).toBe(1);
  });

  it("no status line for an episode that already holds a registo, an id that is no group, or text that is not an id", async () => {
    expect(count(await render("therapist", { episodio: EP_APP }), OPENED)).toBe(0);
    expect(count(await render("therapist", { episodio: "7777cccc-7777-4777-8777-7777777777ff" }), OPENED)).toBe(0);
    expect(count(await render("therapist", { episodio: "Osteopatia" }), OPENED)).toBe(0);
    expect(count(await render("therapist"), OPENED)).toBe(0);
  });

  it("m=episodioAberto&esp=Osteopatia: the open episode is shown (the most recently opened of that specialty) and the confirmation names it", async () => {
    const html = await render("therapist", { m: "episodioAberto", esp: "Osteopatia" });
    expect(count(html, CONFIRM)).toBe(1);
    const panel = element(html, "add-episode-confirm", "div")!;
    expect(panel).toContain('role="group"');
    expect(panel).toContain('aria-labelledby="add-episode-confirm-title"');
    const whole = html.slice(html.indexOf(CONFIRM), html.indexOf('data-testid="record-groups"'));
    expect(unescape(whole)).toContain("Já existe um episódio de Osteopatia aberto");
    expect(whole).toMatch(/<h3[^>]*id="add-episode-confirm-title"[^>]*tabindex="-1"/);
    // EMPTY_NEW (5 October) was opened after APP_OPEN (15 September): it is the one shown.
    expect(unescape(whole)).toContain("Episódio aberto: Osteopatia (05/10/2026). Não foi aberto nenhum episódio novo.");
    expect(whole).not.toContain("Osteopatia (15/09/2026). Não");
    // The confirmation posts the patient, the specialty and THAT episode's id, and nothing else.
    const form = /<form[^>]*>(?:(?!<\/form>)[\s\S])*name="confirmOpenEpisodeId"[\s\S]*?<\/form>/.exec(whole)![0];
    expect(form).toContain(`name="patientId" value="${PATIENT_ID}"`);
    expect(form).toContain('name="specialty" value="Osteopatia"');
    expect(form).toContain(`name="confirmOpenEpisodeId" value="${EP_EMPTY_NEW}"`);
    expect([...form.matchAll(/\bname="([^"]+)"/g)].map((n) => n[1]).sort()).toEqual(["confirmOpenEpisodeId", "patientId", "specialty"]);
    expect(unescape(form)).toContain("Abrir outro episódio de Osteopatia");
    // The way to the open episode (its group on this tab), and the way out.
    expect(element(html, "add-episode-confirm-view", "a")!).toContain(`href="#episodio-${EP_EMPTY_NEW}"`);
    expect(unescape(element(html, "add-episode-confirm-view", "a")!)).toContain("Ver o episódio aberto");
    const cancel = unescape(element(html, "add-episode-confirm-cancel", "a")!);
    expect(cancel).toContain(`href="/patients/${PATIENT_ID}?tab=registos"`);
    expect(cancel).toContain("Cancelar");
  });

  it("the other specialty names its own open episode", async () => {
    const html = await render("therapist", { m: "episodioAberto", esp: "Fisioterapia" });
    expect(html).toContain(`name="confirmOpenEpisodeId" value="${EP_EMPTY_OLD}"`);
    expect(html).not.toContain(`name="confirmOpenEpisodeId" value="${EP_EMPTY_NEW}"`);
  });

  it("an open episode whose group is hidden (its registos are annulled and not shown) is linked by its own page", async () => {
    h.records = [];
    h.openEpisodes = [APP_OPEN];
    const html = await render("therapist", { m: "episodioAberto", esp: "Osteopatia" });
    expect(element(html, "add-episode-confirm-view", "a")!).toContain(`href="/clinical/episodes/${EP_APP}"`);
  });

  it("no question when there is nothing to ask about: a word off the list, no open episode of the specialty, no esp, or a viewer who may not open one", async () => {
    expect(count(await render("therapist", { m: "episodioAberto", esp: "Pilates" }), CONFIRM)).toBe(0);
    expect(count(await render("therapist", { m: "episodioAberto", esp: "osteopatia" }), CONFIRM)).toBe(0);
    expect(count(await render("therapist", { m: "episodioAberto" }), CONFIRM)).toBe(0);
    expect(count(await render("therapist", { esp: "Osteopatia" }), CONFIRM)).toBe(0);
    expect(count(await render("owner", { m: "episodioAberto", esp: "Osteopatia" }), CONFIRM)).toBe(0);
    h.openEpisodes = [EMPTY_OLD];
    expect(count(await render("therapist", { m: "episodioAberto", esp: "Osteopatia" }), CONFIRM)).toBe(0);
  });

  it("m=episodeErr: the pt-PT alert, once, on the tab; no m, or another m, draws none", async () => {
    const html = await render("therapist", { m: "episodeErr" });
    expect(count(html, ERROR)).toBe(1);
    const alert = element(html, "add-episode-error", "p")!;
    expect(alert).toContain('role="alert"');
    expect(unescape(alert)).toContain("Não foi possível criar o episódio.");
    expect(count(await render("therapist"), ERROR)).toBe(0);
    expect(count(await render("therapist", { m: "avaliacaoErr" }), ERROR)).toBe(0);
  });
});
