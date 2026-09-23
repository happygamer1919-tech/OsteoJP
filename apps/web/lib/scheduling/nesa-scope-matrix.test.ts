/**
 * NESA-SCOPE - THE ROLE x SURFACE MATRIX.
 *
 * One machine per clinic, both rows named "NESA". For every role the card names
 * and every staff selector or directory that role can reach, this file builds
 * the list the way the page builds it and counts the NESA options in it:
 *
 *   - getAgendaOptions runs for real over a table-keyed transaction stub, with
 *     the 60-second cache passed through (the labels are computed AFTER it);
 *   - the agenda page's machine offer and reconcileAgendaStaff are its own
 *     expressions (app/agenda/page.tsx), repeated here;
 *   - the drawer's lists come from bookingStaffOptions, the function the drawer
 *     calls;
 *   - Horarios and Equipa use the page expressions and the real capability map
 *     (`can`), so "this role cannot see this surface" is asserted, not assumed.
 *
 * TWO VARIANTS, and the difference between them is the point. With the machine
 * rows BOOKABLE, NESA rides the people roster into every list. NOT bookable, it
 * reaches only the agenda, through the per-request machine read (SCHED-29.4),
 * and every other directory lists no NESA at all. Both must hold the rule: never
 * the other clinic's row for a single-clinic viewer, two different suffixes for
 * a viewer who sees both.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("@/lib/auth/viewer-locations", () => ({
  viewerLocationScope: vi.fn(),
  bookingLocationScope: vi.fn(),
}));
vi.mock("./therapist-locations", () => ({ readTherapistLocationAssignments: vi.fn() }));

import { can, type Role } from "@osteojp/auth";
import { locations, servicePacks, services, users } from "@osteojp/db";
import { runScoped as runScopedImport } from "@/lib/auth/context";
import {
  bookingLocationScope as bookingScopeImport,
  viewerLocationScope as viewerScopeImport,
} from "@/lib/auth/viewer-locations";
import { resolveScheduleScope } from "@/lib/admin/schedule-scope";
import { readTherapistLocationAssignments as readAssignmentsImport } from "./therapist-locations";
import { getAgendaOptions } from "./data";
import { bookingStaffOptions } from "./booking-staff-options";
import {
  sharedResourcesForViewer,
  withSharedResourceOptions,
  type SharedResource,
} from "./shared-resource-guard";
import {
  reconcileAgendaStaff,
  relabelStaffRows,
  staffCardTitles,
  staffLabelContext,
} from "./staff-options";
import type { AgendaOptions } from "./types";

const runScoped = vi.mocked(runScopedImport);
const viewerLocationScope = vi.mocked(viewerScopeImport);
const bookingLocationScope = vi.mocked(bookingScopeImport);
const readAssignments = vi.mocked(readAssignmentsImport);

const LV = "loc-lv";
const CB = "loc-cb";
const NESA_CB = "nesa-cb";
const NESA_LV = "nesa-lv";
const NESA_IDS = new Set([NESA_CB, NESA_LV]);

const LOCATION_ROWS = [
  { id: CB, label: "OsteoJP (CB)", opensAt: "08:00:00", closesAt: "20:00:00", middayClosedFrom: null, middayClosedTo: null },
  { id: LV, label: "OsteoJP (LV)", opensAt: "08:00:00", closesAt: "20:00:00", middayClosedFrom: null, middayClosedTo: null },
];

/** Staff id -> clinics. The machines are installed at one clinic each. */
const ASSIGNMENTS: [string, string[]][] = [
  ["ana", [LV]],
  ["bruno", [CB]],
  [NESA_CB, [CB]],
  [NESA_LV, [LV]],
  ["admin-lv", [LV]],
  ["recep-cb", [CB]],
];

/** The per-request machine read (listSharedResources), name-ordered. */
const MACHINES: SharedResource[] = [
  { id: NESA_CB, label: "NESA", locationIds: [CB] },
  { id: NESA_LV, label: "NESA", locationIds: [LV] },
];

function userRows(bookable: boolean) {
  return [
    { id: "admin-lv", label: "Admin Lisboa", isBookable: false },
    { id: "ana", label: "Ana Lisboa", isBookable: true },
    { id: "bruno", label: "Bruno Castelo", isBookable: true },
    { id: NESA_CB, label: "NESA", isBookable: bookable },
    { id: NESA_LV, label: "NESA", isBookable: bookable },
    { id: "owner", label: "Dono", isBookable: false },
    { id: "recep-cb", label: "Rececao Castelo", isBookable: false },
  ];
}

/** A drizzle-shaped stub that answers each query by the table named in `from`. */
function tableTx(rows: Map<unknown, unknown[]>) {
  const query = () => {
    let table: unknown = null;
    const q: Record<string, unknown> = {};
    for (const k of ["select", "selectDistinct", "where", "orderBy", "innerJoin", "leftJoin", "limit"]) {
      q[k] = () => q;
    }
    q.from = (t: unknown) => {
      table = t;
      return q;
    };
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rows.get(table) ?? []).then(resolve, reject);
    return q;
  };
  return { select: query, selectDistinct: query };
}

type Viewer = {
  name: string;
  role: Role;
  userId: string;
  /** viewerLocationScope: null for owner and therapist. */
  readScope: string[] | null;
  /** bookingLocationScope: null for the owner. */
  bookingScope: string[] | null;
  /** resolveViewerLocationIds: their staff_locations. */
  ownClinics: string[];
};

const LV_THERAPIST: Viewer = {
  name: "LV therapist (one clinic)",
  role: "therapist",
  userId: "ana",
  readScope: null,
  bookingScope: [LV],
  ownClinics: [LV],
};
const CB_RECEPTION: Viewer = {
  name: "CB reception (one clinic)",
  role: "reception",
  userId: "recep-cb",
  readScope: [CB],
  bookingScope: [CB],
  ownClinics: [CB],
};
const LV_ADMIN: Viewer = {
  name: "LV admin (one clinic)",
  role: "admin",
  userId: "admin-lv",
  readScope: [LV],
  bookingScope: [LV],
  ownClinics: [LV],
};
// An owner with ONE staff_locations row: the owner is tenant-wide in every scope
// function whatever that row says, so they still see both machines.
const OWNER: Viewer = {
  name: "owner",
  role: "owner",
  userId: "owner",
  readScope: null,
  bookingScope: null,
  ownClinics: [CB],
};

async function agendaOptions(
  viewer: Viewer,
  bookable: boolean,
  toolbarLocationId: string | null = null,
  keepStaffId?: string,
): Promise<AgendaOptions> {
  viewerLocationScope.mockResolvedValue(viewer.readScope);
  bookingLocationScope.mockResolvedValue(viewer.bookingScope);
  readAssignments.mockResolvedValue(new Map(ASSIGNMENTS.map(([id, l]) => [id, [...l]])));
  const rows = new Map<unknown, unknown[]>([
    [users, userRows(bookable)],
    [locations, LOCATION_ROWS],
    [services, []],
    [servicePacks, []],
  ]);
  runScoped.mockImplementation((async (_ctx: unknown, fn: (tx: unknown) => unknown) =>
    fn(tableTx(rows))) as never);
  return getAgendaOptions(
    { tenantId: "t-1", role: viewer.role, userId: viewer.userId } as never,
    toolbarLocationId,
    keepStaffId ? { keepStaffId } : undefined,
  );
}

/** app/agenda/page.tsx: the toolbar clinic is pinned for a single-clinic viewer. */
async function agendaPage(viewer: Viewer, bookable: boolean): Promise<AgendaOptions> {
  const lockTherapist = viewer.role === "therapist";
  const toolbar = lockTherapist ? null : viewer.readScope?.length === 1 ? viewer.readScope[0]! : null;
  const options = await agendaOptions(viewer, bookable, toolbar);
  const offered =
    viewer.role === "owner" ? MACHINES : sharedResourcesForViewer(MACHINES, viewer.ownClinics);
  return { ...options, ...reconcileAgendaStaff({ options, tenantResources: MACHINES, offered }) };
}

type Opt = { id: string; label: string };
const nesa = (list: readonly Opt[]) => list.filter((o) => NESA_IDS.has(o.id));

/** What the drawer is handed and what it shows. */
function drawer(
  viewer: Viewer,
  options: AgendaOptions,
  mode:
    | {
        kind: "create";
        locationId: string;
        /** A value chosen before Localizacao moved to `locationId`. */
        practitionerId?: string;
        practitionerTwoId?: string;
      }
    | { kind: "edit"; locationId: string; practitionerId: string; practitionerName: string },
) {
  const selfLocked = viewer.role === "therapist" && mode.kind === "create";
  const practitionerId =
    mode.kind === "edit"
      ? mode.practitionerId
      : (mode.practitionerId ?? (selfLocked ? viewer.userId : null));
  return bookingStaffOptions({
    isTherapist: viewer.role === "therapist",
    selfLocked,
    selfUserId: viewer.userId,
    pool: options.allTherapists ?? options.therapists,
    assignments: new Map(Object.entries(options.therapistLocationIds ?? {})),
    resources: options.sharedResources ?? [],
    locationId: mode.locationId,
    practitionerId,
    practitionerTwoId: mode.kind === "create" ? (mode.practitionerTwoId ?? null) : null,
    locationTouched: false,
    editing:
      mode.kind === "edit"
        ? { practitionerId: mode.practitionerId, practitionerName: mode.practitionerName }
        : null,
    labels: staffLabelContext(options),
  });
}

/**
 * agenda-view.tsx and marcacoes-view.tsx render the Terapeutas filter only when
 * the viewer is not a therapist (`!lockTherapist`), and block-time-dialog.tsx
 * renders a therapist's own name as text instead of a select.
 */
function toolbarFilter(viewer: Viewer, options: AgendaOptions, toolbarLocationId: string | null): Opt[] {
  if (viewer.role === "therapist") return [];
  return withSharedResourceOptions(options.therapists, options.sharedResources ?? [], toolbarLocationId);
}
function blockTimeSelect(viewer: Viewer, options: AgendaOptions): Opt[] {
  return viewer.role === "therapist" ? [] : options.therapists;
}
function marcacoesFilter(viewer: Viewer, options: AgendaOptions): Opt[] {
  return viewer.role === "therapist" ? [] : options.therapists;
}

/** The Terapeuta select's NESA options, whichever select the role is shown. */
function terapeuta(viewer: Viewer, built: ReturnType<typeof bookingStaffOptions>, create: boolean): Opt[] {
  return viewer.role === "therapist" && create ? built.selfResources : built.therapistOptions;
}

/** listStaff's read scope, then the Equipa page's titles. */
function equipa(viewer: Viewer): Map<string, string> | null {
  if (!can(viewer.role, "users:read")) return null;
  const all = userRows(true).map((u) => ({ id: u.id, fullName: u.label }));
  const assigned = new Map(ASSIGNMENTS.map(([id, l]) => [id, new Set(l)]));
  const listed = viewer.readScope
    ? all.filter((u) => [...(assigned.get(u.id) ?? [])].some((l) => viewer.readScope!.includes(l)))
    : all;
  return staffCardTitles(listed, {
    viewerScope: viewer.readScope,
    activeLocations: LOCATION_ROWS.map((l) => ({ id: l.id, name: l.label })),
    assignedLocations: assigned,
  });
}

beforeEach(() => {
  runScoped.mockReset();
  viewerLocationScope.mockReset();
  bookingLocationScope.mockReset();
  readAssignments.mockReset();
});

for (const bookable of [true, false]) {
  const variant = bookable ? "machine rows BOOKABLE" : "machine rows NOT bookable (the e2e fixture's shape)";

  describe(`NESA-SCOPE matrix, ${variant}`, () => {
    // ======================================================================
    // LV THERAPIST: exactly LV's NESA wherever a therapist sees staff at all.
    // ======================================================================
    describe(LV_THERAPIST.name, () => {
      const v = LV_THERAPIST;

      it("Terapeuta, Nova marcacao (self-locked): exactly one NESA, LV's, unsuffixed", async () => {
        const built = drawer(v, await agendaPage(v, bookable), { kind: "create", locationId: LV });
        expect(nesa(terapeuta(v, built, true))).toEqual([{ id: NESA_LV, label: "NESA", locationIds: [LV] }]);
      });

      it("Terapeuta 2, Nova marcacao (self-locked): exactly one NESA, LV's", async () => {
        const built = drawer(v, await agendaPage(v, bookable), { kind: "create", locationId: LV });
        expect(nesa(built.practitionerTwoOptions).map((o) => o.id)).toEqual([NESA_LV]);
      });

      it(
        bookable
          ? "Terapeuta, Editar marcacao: exactly one NESA, LV's"
          : "Terapeuta, Editar marcacao: none, because a therapist's edit lists the bookable roster only (the SCHED-17 machine offer is create-only)",
        async () => {
          const built = drawer(v, await agendaPage(v, bookable), {
            kind: "edit",
            locationId: LV,
            practitionerId: "ana",
            practitionerName: "Ana Lisboa",
          });
          expect(nesa(terapeuta(v, built, false)).map((o) => o.id)).toEqual(bookable ? [NESA_LV] : []);
        },
      );

      it("Terapeuta, Editar marcacao on the OTHER clinic's NESA row: that id stays an option, labelled apart from any twin", async () => {
        const built = drawer(v, await agendaPage(v, bookable), {
          kind: "edit",
          locationId: LV,
          practitionerId: NESA_CB,
          practitionerName: "NESA",
        });
        const shown = nesa(terapeuta(v, built, false));
        expect(shown.map((o) => o.id)).toContain(NESA_CB);
        expect(shown.map((o) => o.label)).toEqual(bookable ? ["NESA (LV)", "NESA (CB)"] : ["NESA"]);
      });

      it("Terapeutas filter (agenda), Bloquear horario, Marcacoes filter: zero, none is a list for a therapist", async () => {
        const options = await agendaPage(v, bookable);
        expect(nesa(toolbarFilter(v, options, null))).toEqual([]);
        expect(nesa(blockTimeSelect(v, options))).toEqual([]);
        expect(nesa(marcacoesFilter(v, await agendaOptions(v, bookable)))).toEqual([]);
        // Bloquear horario shows their own name as text, looked up here.
        expect(options.therapists.find((t) => t.id === v.userId)?.label).toBe("Ana Lisboa");
      });

      it("CARE-01 picker and Estatisticas: zero, a therapist holds neither capability", () => {
        expect(can(v.role, "care_team:manage")).toBe(false);
        expect(can(v.role, "statistics:read")).toBe(false);
      });

      it("Horarios: zero NESA, the therapist's schedule scope is themselves only", async () => {
        const options = await agendaOptions(v, bookable);
        const scope = await resolveScheduleScope({ tenantId: "t-1", role: v.role, userId: v.userId });
        const shown = scope.kind === "self" ? options.therapists.filter((t) => t.id === scope.userId) : options.therapists;
        expect(shown.map((t) => t.id)).toEqual(["ana"]);
        expect(nesa(shown)).toEqual([]);
      });

      it("Equipa: zero, a therapist has no users:read and cannot open it", () => {
        expect(equipa(v)).toBeNull();
      });

      it(
        bookable
          ? "Ficha, Consultas Terapeuta filter: exactly one NESA, LV's"
          : "Ficha, Consultas Terapeuta filter: none, the page reads the bookable roster only",
        async () => {
          const options = await agendaOptions(v, bookable);
          expect(nesa(options.therapists)).toEqual(bookable ? [{ id: NESA_LV, label: "NESA" }] : []);
        },
      );

      it("Ficha filter keeps the id the URL filters by, even outside the therapist's clinics", async () => {
        const options = await agendaOptions(v, bookable, null, "bruno");
        expect(options.therapists.map((t) => t.id)).toContain("bruno");
      });

      it("the therapist's staff lists never carry the other clinic's colleague", async () => {
        const options = await agendaOptions(v, bookable);
        expect(options.allTherapists?.map((t) => t.id)).not.toContain("bruno");
      });
    });

    // ======================================================================
    // CB RECEPTION: exactly CB's NESA.
    // ======================================================================
    describe(CB_RECEPTION.name, () => {
      const v = CB_RECEPTION;

      it("Terapeutas filter (agenda, pinned to CB): exactly one NESA, CB's, unsuffixed", async () => {
        const options = await agendaPage(v, bookable);
        expect(nesa(toolbarFilter(v, options, CB))).toEqual([{ id: NESA_CB, label: "NESA" }]);
      });

      it("Terapeuta, Nova marcacao: exactly one NESA, CB's", async () => {
        const built = drawer(v, await agendaPage(v, bookable), { kind: "create", locationId: CB });
        expect(nesa(built.therapistOptions)).toEqual([{ id: NESA_CB, label: "NESA" }]);
      });

      it("Terapeuta 2, Nova marcacao: exactly one NESA, CB's", async () => {
        const built = drawer(v, await agendaPage(v, bookable), { kind: "create", locationId: CB });
        expect(nesa(built.practitionerTwoOptions).map((o) => o.id)).toEqual([NESA_CB]);
      });

      it("Terapeuta, Editar marcacao: exactly one NESA, CB's", async () => {
        const built = drawer(v, await agendaPage(v, bookable), {
          kind: "edit",
          locationId: CB,
          practitionerId: "bruno",
          practitionerName: "Bruno Castelo",
        });
        expect(nesa(built.therapistOptions).map((o) => o.id)).toEqual([NESA_CB]);
      });

      it("Terapeuta, Editar marcacao on the OTHER clinic's NESA row: kept and labelled apart from CB's", async () => {
        const built = drawer(v, await agendaPage(v, bookable), {
          kind: "edit",
          locationId: CB,
          practitionerId: NESA_LV,
          practitionerName: "NESA",
        });
        expect(nesa(built.therapistOptions)).toEqual([
          { id: NESA_CB, label: "NESA (CB)" },
          { id: NESA_LV, label: "NESA (LV)" },
        ]);
      });

      for (const [surface, list] of [
        ["Bloquear horario", async () => blockTimeSelect(v, await agendaPage(v, bookable))],
        ["Marcacoes Terapeutas filter", async () => marcacoesFilter(v, await agendaOptions(v, bookable))],
        ["Ficha Consultas filter", async () => (await agendaOptions(v, bookable)).therapists],
        [
          "CARE-01 picker",
          async () => (can(v.role, "care_team:manage") ? (await agendaOptions(v, bookable)).therapists : []),
        ],
        [
          "Horarios",
          async () => {
            const options = await agendaOptions(v, bookable);
            const scope = await resolveScheduleScope({ tenantId: "t-1", role: v.role, userId: v.userId });
            return scope.kind === "self" ? [] : options.therapists;
          },
        ],
      ] as const) {
        it(
          bookable
            ? `${surface}: exactly one NESA, CB's`
            : `${surface}: none, it lists the bookable roster only (a machine has no time off and no schedule card)`,
          async () => {
            expect(nesa(await list())).toEqual(bookable ? [{ id: NESA_CB, label: "NESA" }] : []);
          },
        );
      }

      it("Equipa: zero, reception has no users:read and cannot open it", () => {
        expect(equipa(v)).toBeNull();
      });
    });

    // ======================================================================
    // LV ADMIN: one clinic; Horarios and Equipa cards show exactly one.
    // ======================================================================
    describe(LV_ADMIN.name, () => {
      const v = LV_ADMIN;

      it("Equipa cards: exactly one NESA card, LV's, titled without a suffix", () => {
        const titles = equipa(v)!;
        expect([...titles.keys()].filter((id) => NESA_IDS.has(id))).toEqual([NESA_LV]);
        expect(titles.get(NESA_LV)).toBe("NESA");
      });

      it(
        bookable ? "Horarios cards: exactly one NESA, LV's" : "Horarios cards: none, Horarios lists the bookable roster only",
        async () => {
          const options = await agendaOptions(v, bookable);
          const scope = await resolveScheduleScope({ tenantId: "t-1", role: v.role, userId: v.userId });
          expect(scope.kind).toBe("locations");
          expect(nesa(options.therapists)).toEqual(bookable ? [{ id: NESA_LV, label: "NESA" }] : []);
        },
      );

      it("Terapeuta, Nova marcacao and Terapeuta 2: exactly one NESA, LV's", async () => {
        const built = drawer(v, await agendaPage(v, bookable), { kind: "create", locationId: LV });
        expect(nesa(built.therapistOptions).map((o) => o.id)).toEqual([NESA_LV]);
        expect(nesa(built.practitionerTwoOptions).map((o) => o.id)).toEqual([NESA_LV]);
      });

      it("Editar marcacao on a legacy LV booking that names the CB row: the CB id stays, labelled (CB)", async () => {
        const built = drawer(v, await agendaPage(v, bookable), {
          kind: "edit",
          locationId: LV,
          practitionerId: NESA_CB,
          practitionerName: "NESA",
        });
        expect(nesa(built.therapistOptions)).toEqual([
          { id: NESA_LV, label: "NESA (LV)" },
          { id: NESA_CB, label: "NESA (CB)" },
        ]);
      });

      it("Estatisticas breakdown: both machines' revenue rows stay, labelled apart", async () => {
        const options = await agendaOptions(v, bookable);
        const rows = relabelStaffRows(
          [
            { id: NESA_CB, name: "NESA", valueCents: 1, count: 1 },
            { id: NESA_LV, name: "NESA", valueCents: 2, count: 1 },
          ],
          staffLabelContext(options)!,
        );
        expect(rows.map((r) => r.name)).toEqual(["NESA (CB)", "NESA (LV)"]);
      });
    });

    // ======================================================================
    // OWNER: two, with two different suffixes.
    // ======================================================================
    describe(OWNER.name, () => {
      const v = OWNER;
      const TWO = [
        { id: NESA_CB, label: "NESA (CB)" },
        { id: NESA_LV, label: "NESA (LV)" },
      ];

      it("Terapeutas filter (agenda, Todas as localizacoes): two, NESA (CB) and NESA (LV)", async () => {
        const options = await agendaPage(v, bookable);
        expect(nesa(toolbarFilter(v, options, null))).toEqual(TWO);
      });

      it("Terapeutas filter scoped to CB: CB's only, and STILL suffixed (the suffix follows the viewer)", async () => {
        const options = await agendaOptions(v, bookable, CB);
        const offered = reconcileAgendaStaff({ options, tenantResources: MACHINES, offered: MACHINES });
        expect(nesa(toolbarFilter(v, { ...options, ...offered }, CB))).toEqual([TWO[0]]);
      });

      it("Equipa cards: two, NESA (CB) and NESA (LV)", () => {
        const titles = equipa(v)!;
        expect(TWO.map((o) => titles.get(o.id))).toEqual(["NESA (CB)", "NESA (LV)"]);
      });

      for (const [surface, list] of [
        ["Bloquear horario", async () => blockTimeSelect(v, await agendaPage(v, bookable))],
        ["Horarios cards", async () => (await agendaOptions(v, bookable)).therapists],
        ["Marcacoes Terapeutas filter", async () => marcacoesFilter(v, await agendaOptions(v, bookable))],
        ["Estatisticas filter", async () => (await agendaOptions(v, bookable)).therapists],
        ["CARE-01 picker", async () => (await agendaOptions(v, bookable)).therapists],
      ] as const) {
        it(
          bookable
            ? `${surface}: two, NESA (CB) and NESA (LV)`
            : `${surface}: none, it lists the bookable roster only`,
          async () => {
            expect(nesa(await list())).toEqual(bookable ? TWO : []);
          },
        );
      }

      it("Terapeuta and Terapeuta 2 in the drawer follow the booking's clinic, suffixed because the owner sees both", async () => {
        const options = await agendaPage(v, bookable);
        const atCb = drawer(v, options, { kind: "create", locationId: CB });
        const atLv = drawer(v, options, { kind: "create", locationId: LV });
        expect(nesa(atCb.therapistOptions)).toEqual([TWO[0]]);
        expect(nesa(atLv.therapistOptions)).toEqual([TWO[1]]);
        expect(nesa(atCb.practitionerTwoOptions)).toEqual([TWO[0]]);
        expect(nesa(atLv.practitionerTwoOptions)).toEqual([TWO[1]]);
      });

      it("Editar marcacao on a legacy LV booking that names the CB row: both, the CB id kept", async () => {
        const built = drawer(v, await agendaPage(v, bookable), {
          kind: "edit",
          locationId: LV,
          practitionerId: NESA_CB,
          practitionerName: "NESA",
        });
        expect(nesa(built.therapistOptions)).toEqual([TWO[1], TWO[0]]);
      });

      // No server check covers a front-desk second participant, and the drawer
      // submits Terapeuta 2 only when this list offers it (SCHED-29).
      it("Terapeuta 2 set to CB's NESA, then Localizacao LV: CB's row is not offered, so none is submitted", async () => {
        const built = drawer(v, await agendaPage(v, bookable), {
          kind: "create",
          locationId: LV,
          practitionerTwoId: NESA_CB,
        });
        expect(nesa(built.practitionerTwoOptions)).toEqual([TWO[1]]);
      });
    });

    // ======================================================================
    // A THERAPIST AT BOTH CLINICS: the suffix follows the viewer, not the list.
    // ======================================================================
    it("a two-clinic therapist's self-locked select at CB offers CB's NESA only, suffixed (CB)", async () => {
      const v: Viewer = {
        name: "two-clinic therapist",
        role: "therapist",
        userId: "ana",
        readScope: null,
        bookingScope: [LV, CB],
        ownClinics: [LV, CB],
      };
      const built = drawer(v, await agendaPage(v, bookable), { kind: "create", locationId: CB });
      expect(built.selfResources.map((r) => `${r.id}=${r.label}`)).toEqual([`${NESA_CB}=NESA (CB)`]);
    });

    it("the same therapist with CB's NESA chosen, then Localizacao LV: CB's row stays the painted value (the server refuses it there)", async () => {
      const v: Viewer = {
        name: "two-clinic therapist",
        role: "therapist",
        userId: "ana",
        readScope: null,
        bookingScope: [LV, CB],
        ownClinics: [LV, CB],
      };
      const built = drawer(v, await agendaPage(v, bookable), {
        kind: "create",
        locationId: LV,
        practitionerId: NESA_CB,
      });
      expect(built.selfResources.map((r) => `${r.id}=${r.label}`)).toEqual([
        `${NESA_LV}=NESA (LV)`,
        `${NESA_CB}=NESA (CB)`,
      ]);
    });
  });
}
