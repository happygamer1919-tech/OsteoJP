// AGENDA-FILTER-SERVICE - the agenda filtered by service chips, remembered per
// device. The values are decided here; app/agenda/service-filter.test.tsx
// covers the markup and what agenda-view.tsx hands its surfaces.

import { afterEach, describe, expect, it } from "vitest";

import {
  AGENDA_SERVICE_FILTER_STORAGE_KEY,
  clientStoredServiceFilter,
  filterByService,
  parseServiceFilter,
  passesServiceFilter,
  readServiceFilter,
  readStoredServiceFilter,
  sanitizeServiceSelection,
  serverStoredServiceFilter,
  servicesAtClinics,
  toggleServiceSelection,
  writeServiceFilter,
} from "./agenda-service-filter";
import type { ViewStorage } from "./agenda-view-preference";

const OSTEO = "svc-osteo";
const NESA = "svc-nesa";
const DRENAGEM = "svc-drenagem";
const OFFERED = [DRENAGEM, NESA, OSTEO];

const ANA = "t-ana";
const RUI = "t-rui";

type Row = { id: string; practitionerId: string; serviceId: string | null };

/** Two therapists, two services each, and one booking with no service. */
const ROWS: Row[] = [
  { id: "ana-osteo", practitionerId: ANA, serviceId: OSTEO },
  { id: "ana-nesa", practitionerId: ANA, serviceId: NESA },
  { id: "rui-osteo", practitionerId: RUI, serviceId: OSTEO },
  { id: "rui-nesa", practitionerId: RUI, serviceId: NESA },
  { id: "ana-none", practitionerId: ANA, serviceId: null },
];

/**
 * The THERAPIST filter as the server applies it for a person (listAppointments:
 * practitioner_id in the asked set). It is modelled here only to compose with;
 * the client never re-applies it (see the module header for why).
 */
function serverTherapistFilter(rows: Row[], therapistId: string | null): Row[] {
  return therapistId ? rows.filter((r) => r.practitionerId === therapistId) : rows;
}

const ids = (rows: readonly Row[]) => rows.map((r) => r.id);

function memory(initial: Record<string, string> = {}): ViewStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

const THROWS: ViewStorage = {
  getItem: () => {
    throw new DOMException("denied", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("full", "QuotaExceededError");
  },
};

describe("the filter predicate", () => {
  it("EMPTY SELECTION = ALL: every booking passes, the no-service one too", () => {
    for (const r of ROWS) expect(passesServiceFilter(r, [])).toBe(true);
    // The same array comes back, so an unfiltered agenda hands its surfaces the
    // very prop it was given.
    expect(filterByService(ROWS, [])).toBe(ROWS);
  });

  it("SERVICE ONLY: filtering to NESA hides the osteopatia bookings", () => {
    expect(ids(filterByService(ROWS, [NESA]))).toEqual(["ana-nesa", "rui-nesa"]);
    // CONTROL: the osteopatia rows were there to hide.
    expect(ids(ROWS.filter((r) => r.serviceId === OSTEO))).toEqual(["ana-osteo", "rui-osteo"]);
  });

  it("two chips keep both services, in the bookings' own order", () => {
    expect(ids(filterByService(ROWS, [OSTEO, NESA]))).toEqual([
      "ana-osteo",
      "ana-nesa",
      "rui-osteo",
      "rui-nesa",
    ]);
  });

  it("a booking with NO service is hidden once any chip is selected", () => {
    const none = ROWS.find((r) => r.serviceId === null)!;
    expect(passesServiceFilter(none, [])).toBe(true);
    expect(passesServiceFilter(none, [NESA])).toBe(false);
    expect(passesServiceFilter(none, [NESA, OSTEO, DRENAGEM])).toBe(false);
  });

  it("THERAPIST ONLY: with no chip selected, the server's therapist rows pass through untouched", () => {
    const anas = serverTherapistFilter(ROWS, ANA);
    expect(ids(filterByService(anas, []))).toEqual(["ana-osteo", "ana-nesa", "ana-none"]);
  });

  it("BOTH: a booking shows only if it passes the therapist AND the service filter", () => {
    const shown = filterByService(serverTherapistFilter(ROWS, ANA), [NESA]);
    expect(ids(shown)).toEqual(["ana-nesa"]);
    // Each filter alone keeps more, so the result is the intersection and
    // neither filter is being ignored.
    expect(ids(serverTherapistFilter(ROWS, ANA))).toContain("ana-osteo");
    expect(ids(filterByService(ROWS, [NESA]))).toContain("rui-nesa");
    // And the order of application does not matter: it is an AND.
    expect(ids(serverTherapistFilter(filterByService(ROWS, [NESA]), ANA))).toEqual(ids(shown));
  });
});

describe("servicesAtClinics: the chips are the services visible at the viewer's clinics", () => {
  const LV = "loc-lv";
  const CB = "loc-cb";
  const SERVICES = [
    { id: DRENAGEM, label: "Drenagem Linfática", locationId: CB },
    { id: NESA, label: "NESA", locationId: null },
    { id: OSTEO, label: "Osteopatia", locationId: LV },
  ];

  it("a service at every clinic is always offered; a clinic's service only at that clinic", () => {
    expect(servicesAtClinics(SERVICES, [LV]).map((s) => s.id)).toEqual([NESA, OSTEO]);
    expect(servicesAtClinics(SERVICES, [CB]).map((s) => s.id)).toEqual([DRENAGEM, NESA]);
    expect(servicesAtClinics(SERVICES, [LV, CB]).map((s) => s.id)).toEqual([DRENAGEM, NESA, OSTEO]);
  });

  it("keeps the app's order and the service's own name, and carries nothing else", () => {
    expect(servicesAtClinics(SERVICES, [LV, CB])).toEqual([
      { id: DRENAGEM, label: "Drenagem Linfática" },
      { id: NESA, label: "NESA" },
      { id: OSTEO, label: "Osteopatia" },
    ]);
  });

  it("an absent clinic list or an absent locationId offers the service rather than losing it", () => {
    expect(servicesAtClinics(SERVICES, undefined)).toHaveLength(3);
    expect(servicesAtClinics([{ id: OSTEO, label: "Osteopatia" }], [CB])).toHaveLength(1);
  });

  it("no clinics at all leaves only the every-clinic services", () => {
    expect(servicesAtClinics(SERVICES, []).map((s) => s.id)).toEqual([NESA]);
  });
});

describe("toggling a chip", () => {
  it("selects, then deselects, keeping the chips' order whatever the press order", () => {
    let sel = toggleServiceSelection([], OSTEO, OFFERED);
    expect(sel).toEqual([OSTEO]);
    sel = toggleServiceSelection(sel, DRENAGEM, OFFERED);
    expect(sel).toEqual([DRENAGEM, OSTEO]);
    sel = toggleServiceSelection(sel, OSTEO, OFFERED);
    expect(sel).toEqual([DRENAGEM]);
    sel = toggleServiceSelection(sel, DRENAGEM, OFFERED);
    expect(sel).toEqual([]);
  });

  it("a press on an id that is not offered changes nothing", () => {
    expect(toggleServiceSelection([NESA], "svc-gone", OFFERED)).toEqual([NESA]);
  });
});

describe("sanitizeServiceSelection", () => {
  it("drops unknown ids, duplicates and non-strings, in the chips' order", () => {
    expect(sanitizeServiceSelection([OSTEO, "svc-gone", NESA, OSTEO, 7, null], OFFERED)).toEqual([NESA, OSTEO]);
  });

  it("anything that is not an array is nothing selected", () => {
    for (const raw of [null, undefined, "svc-nesa", 3, { 0: NESA }]) {
      expect(sanitizeServiceSelection(raw, OFFERED)).toEqual([]);
    }
  });
});

describe("the preference store: read", () => {
  it("reads a stored selection", () => {
    const m = memory({ [AGENDA_SERVICE_FILTER_STORAGE_KEY]: JSON.stringify([NESA]) });
    expect(readServiceFilter(m, OFFERED)).toEqual([NESA]);
  });

  it("is empty for no storage and no entry", () => {
    expect(readServiceFilter(null, OFFERED)).toEqual([]);
    expect(readServiceFilter(memory(), OFFERED)).toEqual([]);
  });

  it("is empty, not an exception, when getItem throws", () => {
    expect(() => readServiceFilter(THROWS, OFFERED)).not.toThrow();
    expect(readServiceFilter(THROWS, OFFERED)).toEqual([]);
    expect(readStoredServiceFilter(THROWS)).toBeNull();
    // CONTROL: the stub really does throw, so the arms above measured the catch.
    expect(() => THROWS.getItem(AGENDA_SERVICE_FILTER_STORAGE_KEY)).toThrow();
  });

  it("is empty, not an exception, for malformed JSON", () => {
    for (const raw of ["[", "{nope", "undefined", ""]) {
      const m = memory({ [AGENDA_SERVICE_FILTER_STORAGE_KEY]: raw });
      expect(() => readServiceFilter(m, OFFERED)).not.toThrow();
      expect(readServiceFilter(m, OFFERED)).toEqual([]);
    }
    // CONTROL: the same parse on valid JSON does select.
    expect(parseServiceFilter(JSON.stringify([OSTEO]), OFFERED)).toEqual([OSTEO]);
  });

  it("drops a stored id no longer offered, and does not rewrite storage on read", () => {
    const stored = JSON.stringify(["svc-gone", NESA]);
    const m = memory({ [AGENDA_SERVICE_FILTER_STORAGE_KEY]: stored });
    expect(readServiceFilter(m, OFFERED)).toEqual([NESA]);
    expect(m.data[AGENDA_SERVICE_FILTER_STORAGE_KEY]).toBe(stored);
    // Nothing offered at all: the stored choice selects nothing.
    expect(readServiceFilter(m, [])).toEqual([]);
  });
});

describe("the preference store: write", () => {
  it("stores the selection and says so; it reads back", () => {
    const m = memory();
    expect(writeServiceFilter(m, [NESA, OSTEO])).toBe(true);
    expect(JSON.parse(m.data[AGENDA_SERVICE_FILTER_STORAGE_KEY]!)).toEqual([NESA, OSTEO]);
    expect(readServiceFilter(m, OFFERED)).toEqual([NESA, OSTEO]);
    // Clearing is a write too: an empty list, read back as nothing selected.
    expect(writeServiceFilter(m, [])).toBe(true);
    expect(readServiceFilter(m, OFFERED)).toEqual([]);
  });

  it("returns false, not an exception, for no storage or a setItem that throws", () => {
    expect(writeServiceFilter(null, [NESA])).toBe(false);
    expect(() => writeServiceFilter(THROWS, [NESA])).not.toThrow();
    expect(writeServiceFilter(THROWS, [NESA])).toBe(false);
    expect(() => THROWS.setItem(AGENDA_SERVICE_FILTER_STORAGE_KEY, "[]")).toThrow();
  });

  it("uses its own key, never the Dia/Semana one", () => {
    expect(AGENDA_SERVICE_FILTER_STORAGE_KEY).not.toBe("osteojp.agenda.view");
  });
});

describe("the two snapshots useSyncExternalStore reads", () => {
  const g = globalThis as { window?: unknown };
  afterEach(() => {
    delete g.window;
  });

  it("the server snapshot is always nothing, so hydration matches the server render", () => {
    g.window = { localStorage: memory({ [AGENDA_SERVICE_FILTER_STORAGE_KEY]: JSON.stringify([NESA]) }) };
    expect(serverStoredServiceFilter()).toBeNull();
  });

  it("the client snapshot is the stored string, a primitive that compares equal between reads", () => {
    const raw = JSON.stringify([NESA]);
    g.window = { localStorage: memory({ [AGENDA_SERVICE_FILTER_STORAGE_KEY]: raw }) };
    expect(clientStoredServiceFilter()).toBe(raw);
    expect(Object.is(clientStoredServiceFilter(), clientStoredServiceFilter())).toBe(true);
  });

  it("the client snapshot is null, not an exception, with no window or a localStorage that throws", () => {
    expect(clientStoredServiceFilter()).toBeNull();
    g.window = Object.defineProperty({}, "localStorage", {
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });
    expect(() => clientStoredServiceFilter()).not.toThrow();
    expect(clientStoredServiceFilter()).toBeNull();
    g.window = { localStorage: THROWS };
    expect(clientStoredServiceFilter()).toBeNull();
  });
});
