import { describe, expect, it } from "vitest";
import {
  clinicCode,
  clinicCodeMap,
  labelStaffCollisions,
  reconcileAgendaStaff,
  relabelStaffRows,
  resolveStaffCollisions,
  staffCardTitles,
  staffLabelContext,
  type StaffLabelContext,
} from "./staff-options";

/**
 * NESA-SCOPE - the collision rule, as a table. The fixture is the shape the card
 * is about: one machine per clinic, both rows named "NESA", plus people whose
 * names are unique and must never move.
 */
const LV = "loc-lv";
const CB = "loc-cb";
const CODES = clinicCodeMap([
  { id: LV, label: "OsteoJP (LV)" },
  { id: CB, label: "OsteoJP (CB)" },
]);

const NESA_CB = { id: "nesa-cb", label: "NESA" };
const NESA_LV = { id: "nesa-lv", label: "NESA" };
const ANA = { id: "ana", label: "Ana Lisboa" };
const BRUNO = { id: "bruno", label: "Bruno Castelo" };

const ASSIGNMENTS = new Map<string, string[]>([
  [NESA_CB.id, [CB]],
  [NESA_LV.id, [LV]],
  [ANA.id, [LV]],
  [BRUNO.id, [CB]],
]);

const ctx = (viewerClinicIds: string[], keepId: string | null = null): StaffLabelContext => ({
  viewerClinicIds,
  assignments: ASSIGNMENTS,
  clinicCodeById: CODES,
  keepId,
});

const ROSTER = [ANA, BRUNO, NESA_CB, NESA_LV];
const labels = (list: readonly { id: string; label: string }[]) => list.map((o) => `${o.id}=${o.label}`);

describe("clinicCode - the suffix a clinic contributes", () => {
  it.each([
    ["OsteoJP (CB)", "CB"],
    ["OsteoJP (LV)", "LV"],
    ["  Clinica ( LV )  ", "LV"],
    ["Consultorio B (E2E)", "E2E"],
    // No trailing parenthetical: the whole name is the code, never nothing.
    ["Linda-a-Velha", "Linda-a-Velha"],
    // An empty parenthetical names nothing, so it falls back too.
    ["Sede ()", "Sede ()"],
    // Only a TRAILING parenthetical counts.
    ["Sala (A) Norte", "Sala (A) Norte"],
  ])("%s -> %s", (name, code) => {
    expect(clinicCode(name)).toBe(code);
  });
});

describe("resolveStaffCollisions - who is shown and how they are named", () => {
  it("a single-clinic viewer keeps only their clinic's row, with NO suffix", () => {
    const out = resolveStaffCollisions(ROSTER, ctx([LV]));
    expect(labels(out)).toEqual(["ana=Ana Lisboa", "bruno=Bruno Castelo", "nesa-lv=NESA"]);
  });

  it("the other single clinic, the other row", () => {
    expect(labels(resolveStaffCollisions(ROSTER, ctx([CB])))).toEqual([
      "ana=Ana Lisboa",
      "bruno=Bruno Castelo",
      "nesa-cb=NESA",
    ]);
  });

  it("a two-clinic viewer keeps both, each suffixed with its own clinic, in input order", () => {
    const out = resolveStaffCollisions(ROSTER, ctx([LV, CB]));
    expect(labels(out)).toEqual([
      "ana=Ana Lisboa",
      "bruno=Bruno Castelo",
      "nesa-cb=NESA (CB)",
      "nesa-lv=NESA (LV)",
    ]);
  });

  it("the owner is a two-clinic viewer (every active clinic): two rows, two different suffixes", () => {
    const out = resolveStaffCollisions(ROSTER, ctx([...CODES.keys()]));
    const nesa = out.filter((o) => o.id.startsWith("nesa-"));
    expect(nesa).toHaveLength(2);
    expect(new Set(nesa.map((o) => o.label)).size).toBe(2);
  });

  it("keepId keeps the other clinic's row for a single-clinic viewer, and then BOTH are suffixed", () => {
    // The legacy edit: an LV session whose appointment names the CB row. Two
    // rows named "NESA" on one screen is exactly what the suffix is for.
    const out = resolveStaffCollisions(ROSTER, ctx([LV], NESA_CB.id));
    expect(labels(out)).toEqual([
      "ana=Ana Lisboa",
      "bruno=Bruno Castelo",
      "nesa-cb=NESA (CB)",
      "nesa-lv=NESA (LV)",
    ]);
  });

  it("keepId as the only survivor of its group is kept and NOT suffixed: nothing on screen shares its name", () => {
    const other = { id: "nesa-cb-2", label: "NESA" };
    const out = resolveStaffCollisions([ANA, NESA_CB, other], {
      ...ctx([LV], NESA_CB.id),
      assignments: new Map([...ASSIGNMENTS, [other.id, [CB]]]),
    });
    expect(out).toEqual([ANA, NESA_CB]);
    expect(out[1]).toBe(NESA_CB);
  });

  it("unique names come back as the SAME objects (no clone, no suffix)", () => {
    const out = resolveStaffCollisions(ROSTER, ctx([LV, CB]));
    expect(out[0]).toBe(ANA);
    expect(out[1]).toBe(BRUNO);
  });

  it("a roster with no collision is returned member for member, identical", () => {
    const out = resolveStaffCollisions([ANA, BRUNO], ctx([LV]));
    expect(out).toEqual([ANA, BRUNO]);
    expect(out[0]).toBe(ANA);
    expect(out[1]).toBe(BRUNO);
  });

  it("collides on case and whitespace, and suffixes the trimmed label", () => {
    const spaced = { id: "nesa-lv", label: "  nesa " };
    const out = resolveStaffCollisions([NESA_CB, spaced], ctx([LV, CB]));
    expect(labels(out)).toEqual(["nesa-cb=NESA (CB)", "nesa-lv=nesa (LV)"]);
  });

  it("collapses inner whitespace before comparing", () => {
    const a = { id: "nesa-cb", label: "NESA  Sala" };
    const b = { id: "nesa-lv", label: "Nesa Sala" };
    expect(labels(resolveStaffCollisions([a, b], ctx([LV, CB])))).toEqual([
      "nesa-cb=NESA  Sala (CB)",
      "nesa-lv=Nesa Sala (LV)",
    ]);
  });

  it("two same-name PEOPLE at the SAME clinic: both stay, labels unchanged (a shared suffix distinguishes nothing)", () => {
    const one = { id: "ana-1", label: "Ana Silva" };
    const two = { id: "ana-2", label: "Ana Silva" };
    const assignments = new Map([
      [one.id, [LV]],
      [two.id, [LV]],
    ]);
    const out = resolveStaffCollisions([one, two], {
      viewerClinicIds: [LV, CB],
      assignments,
      clinicCodeById: CODES,
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(one);
    expect(out[1]).toBe(two);
  });

  it("an UNASSIGNED member of a group is kept (PL-14) and unsuffixed; the assigned one is suffixed", () => {
    const loose = { id: "nesa-none", label: "NESA" };
    const out = resolveStaffCollisions([NESA_CB, loose], ctx([LV, CB]));
    expect(labels(out)).toEqual(["nesa-cb=NESA (CB)", "nesa-none=NESA"]);
  });

  it("a member at both clinics names both, sorted", () => {
    const both = { id: "nesa-both", label: "NESA" };
    const assignments = new Map([...ASSIGNMENTS, [both.id, [LV, CB]]]);
    const out = resolveStaffCollisions([NESA_LV, both], {
      viewerClinicIds: [LV, CB],
      assignments,
      clinicCodeById: CODES,
    });
    expect(labels(out)).toEqual(["nesa-lv=NESA (LV)", "nesa-both=NESA (CB, LV)"]);
  });

  it("a viewer with NO clinic of the group's keeps neither machine (and no one else moves)", () => {
    const out = resolveStaffCollisions(ROSTER, ctx(["loc-elsewhere"]));
    expect(labels(out)).toEqual(["ana=Ana Lisboa", "bruno=Bruno Castelo"]);
  });
});

describe("labelStaffCollisions - labels only, nothing dropped", () => {
  it("keeps the row a single-clinic viewer would not be offered, and labels both apart", () => {
    const out = labelStaffCollisions([NESA_CB, NESA_LV], {
      viewerClinicIds: [LV],
      assignments: ASSIGNMENTS,
      clinicCodeById: CODES,
    });
    expect(labels(out)).toEqual(["nesa-cb=NESA (CB)", "nesa-lv=NESA (LV)"]);
  });

  it("is idempotent on a list the server already labelled", () => {
    const once = labelStaffCollisions(ROSTER, { viewerClinicIds: [LV, CB], assignments: ASSIGNMENTS, clinicCodeById: CODES });
    const twice = labelStaffCollisions(once, { viewerClinicIds: [LV, CB], assignments: ASSIGNMENTS, clinicCodeById: CODES });
    expect(twice).toEqual(once);
  });
});

describe("staffLabelContext - absent options mean labels are left alone", () => {
  it("is null for options that predate NESA-SCOPE", () => {
    expect(staffLabelContext({})).toBeNull();
    expect(staffLabelContext({ viewerClinicIds: [LV] })).toBeNull();
  });

  it("rebuilds the maps from the serialised records", () => {
    const c = staffLabelContext({
      viewerClinicIds: [LV],
      clinicCodes: { [LV]: "LV" },
      therapistLocationIds: { [NESA_LV.id]: [LV] },
    });
    expect(c?.assignments.get(NESA_LV.id)).toEqual([LV]);
    expect(c?.clinicCodeById.get(LV)).toBe("LV");
  });
});

describe("reconcileAgendaStaff - the cached roster and the per-request machines agree", () => {
  const MACHINES = [
    { id: NESA_CB.id, label: "NESA", locationIds: [CB] },
    { id: NESA_LV.id, label: "NESA", locationIds: [LV] },
  ];
  const opts = (viewerClinicIds: string[], roster = ROSTER) => ({
    therapists: roster,
    allTherapists: roster,
    therapistLocationIds: Object.fromEntries(ASSIGNMENTS),
    viewerClinicIds,
    clinicCodes: Object.fromEntries(CODES),
  });

  it("a machine the viewer is not offered leaves the people lists too (bookable flag or not)", () => {
    const out = reconcileAgendaStaff({
      options: opts([LV]),
      tenantResources: MACHINES,
      offered: [MACHINES[1]!],
    });
    expect(out.therapists.map((o) => o.id)).not.toContain(NESA_CB.id);
    expect(out.allTherapists.map((o) => o.id)).not.toContain(NESA_CB.id);
    expect(out.sharedResources.map((r) => r.id)).toEqual([NESA_LV.id]);
  });

  it("an unassigned viewer is offered no machine to book, but a bookable one stays in the filter lists", () => {
    // Round 3 review: before this, the agenda dropped both bookable machines for
    // an unassigned admin while Marcacoes and Horarios listed them.
    const roster = [ANA, BRUNO, NESA_CB, NESA_LV];
    const out = reconcileAgendaStaff({ options: opts([LV, CB], roster), tenantResources: MACHINES, offered: [] });
    expect(out.allTherapists.map((o) => o.label)).toEqual([ANA.label, BRUNO.label, "NESA (CB)", "NESA (LV)"]);
    expect(out.sharedResources).toEqual([]);
  });

  it("a single-clinic viewer still loses the other clinic's bookable machine", () => {
    const roster = [ANA, BRUNO, NESA_CB, NESA_LV];
    const out = reconcileAgendaStaff({ options: opts([LV], roster), tenantResources: MACHINES, offered: [MACHINES[1]!] });
    expect(out.allTherapists.map((o) => o.id)).toEqual([ANA.id, BRUNO.id, NESA_LV.id]);
  });

  it("a bookable twin and a non-bookable twin still suffix each other (labels over the union)", () => {
    // The CB row is in the roster (bookable), the LV row only in the machine read.
    const roster = [ANA, BRUNO, NESA_CB];
    const out = reconcileAgendaStaff({
      options: opts([LV, CB], roster),
      tenantResources: MACHINES,
      offered: MACHINES,
    });
    expect(out.allTherapists.find((o) => o.id === NESA_CB.id)?.label).toBe("NESA (CB)");
    expect(out.sharedResources.find((r) => r.id === NESA_LV.id)?.label).toBe("NESA (LV)");
  });

  it("takes where a machine is installed from the per-request read, not the cached map", () => {
    const stale = { ...opts([LV, CB]), therapistLocationIds: { [ANA.id]: [LV] } };
    const out = reconcileAgendaStaff({ options: stale, tenantResources: MACHINES, offered: MACHINES });
    expect(out.therapistLocationIds[NESA_LV.id]).toEqual([LV]);
    expect(out.sharedResources.map((r) => r.label)).toEqual(["NESA (CB)", "NESA (LV)"]);
  });

  it("leaves labels alone for options without the NESA-SCOPE fields", () => {
    const out = reconcileAgendaStaff({
      options: { therapists: ROSTER, allTherapists: ROSTER },
      tenantResources: MACHINES,
      offered: MACHINES,
    });
    expect(out.sharedResources.map((r) => r.label)).toEqual(["NESA", "NESA"]);
  });
});

describe("relabelStaffRows - a breakdown row is labelled, never dropped", () => {
  it("labels both machines' revenue rows apart even for a single-clinic viewer", () => {
    const rows = [
      { id: NESA_CB.id, name: "NESA", valueCents: 100, count: 1 },
      { id: NESA_LV.id, name: "NESA", valueCents: 200, count: 2 },
      { id: null, name: "", valueCents: 50, count: 1 },
    ];
    const out = relabelStaffRows(rows, { viewerClinicIds: [LV], assignments: ASSIGNMENTS, clinicCodeById: CODES });
    expect(out.map((r) => r.name)).toEqual(["NESA (CB)", "NESA (LV)", ""]);
    expect(out.map((r) => r.valueCents)).toEqual([100, 200, 50]);
    expect(out[2]).toBe(rows[2]);
  });

  it("a breakdown holding ONE of the two machines takes the label the page's filter shows", () => {
    const rows = [
      { id: NESA_CB.id, name: "NESA", valueCents: 100, count: 1 },
      { id: ANA.id, name: ANA.label, valueCents: 300, count: 3 },
    ];
    const ctx = { viewerClinicIds: [LV, CB], assignments: ASSIGNMENTS, clinicCodeById: CODES };
    const filterOptions = resolveStaffCollisions([ANA, NESA_CB, NESA_LV], ctx);
    const out = relabelStaffRows(rows, ctx, filterOptions);
    expect(out.map((r) => r.name)).toEqual(["NESA (CB)", ANA.label]);
    expect(out[1]).toBe(rows[1]);
    // Control: without the filter's options the lone row has nothing to collide
    // with and keeps the bare name, which is the mismatch this argument closes.
    expect(relabelStaffRows(rows, ctx).map((r) => r.name)).toEqual(["NESA", ANA.label]);
  });
});

describe("staffCardTitles - Equipa card titles", () => {
  const staff = [
    { id: ANA.id, fullName: ANA.label },
    { id: NESA_CB.id, fullName: "NESA" },
    { id: NESA_LV.id, fullName: "NESA" },
  ];
  const assignedLocations = new Map<string, Set<string>>([
    [ANA.id, new Set([LV])],
    [NESA_CB.id, new Set([CB])],
    [NESA_LV.id, new Set([LV])],
  ]);
  const activeLocations = [
    { id: LV, name: "OsteoJP (LV)" },
    { id: CB, name: "OsteoJP (CB)" },
  ];

  it("an unscoped viewer (owner) titles both cards apart", () => {
    const titles = staffCardTitles(staff, { viewerScope: null, activeLocations, assignedLocations });
    expect(titles.get(NESA_CB.id)).toBe("NESA (CB)");
    expect(titles.get(NESA_LV.id)).toBe("NESA (LV)");
    expect(titles.get(ANA.id)).toBe(ANA.label);
  });

  it("a single-clinic viewer gets one card, untitled by any suffix", () => {
    const titles = staffCardTitles(staff, { viewerScope: [LV], activeLocations, assignedLocations });
    expect(titles.has(NESA_CB.id)).toBe(false);
    expect(titles.get(NESA_LV.id)).toBe("NESA");
  });

  it("an unscoped viewer keeps the card of a same-named member whose only clinic was archived", () => {
    // Round 3 review: the owner's Equipa used to drop it, so Gerir could not be
    // opened to move or deactivate that member.
    const ARCHIVED = "loc-archived";
    const withArchived = [...staff, { id: "nesa-old", fullName: "NESA" }];
    const assigned = new Map([...assignedLocations, ["nesa-old", new Set([ARCHIVED])]]);
    const titles = staffCardTitles(withArchived, { viewerScope: null, activeLocations, assignedLocations: assigned });
    expect(titles.has("nesa-old")).toBe(true);
    expect(titles.get(NESA_CB.id)).toBe("NESA (CB)");
    expect(titles.get(NESA_LV.id)).toBe("NESA (LV)");
  });
});
