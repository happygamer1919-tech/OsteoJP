/**
 * page-schedule-again-options.test.tsx (agenda): U6. THE AGENDA HANDS ITS
 * APPOINTMENT PANEL THE TENANT'S MACHINES, FOR A THERAPIST ONLY.
 *
 * The panel hides "Marcar novamente" with scheduleAgainForbidden, which needs
 * the ids of the tenant's shared resources (NESA) to let a therapist copy a
 * NESA visit as the server does. For a therapist the agenda already reads the
 * tenant's machines (SCHED-17), so it passes their ids on rather than reading
 * again. The REAL page runs here with its reads stubbed, and the options it
 * hands AgendaView are read off the element it returns.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  ctx: { tenantId: "t-1", role: "therapist", userId: "u-self" } as { tenantId: string; role: string; userId: string },
  machineReads: 0,
}));

vi.mock("@/lib/auth/context", () => ({ requireRequestContext: async () => h.ctx }));
vi.mock("@/lib/auth/viewer-locations", () => ({
  viewerLocationScope: async () => null,
  resolveViewerLocationIds: async () => ["loc-cb"],
}));
vi.mock("@/lib/patients/queries", () => ({ getPatient: async () => null }));
vi.mock("@/lib/scheduling/data", () => ({
  getAgendaOptions: async () => ({ therapists: [], locations: [], bookableLocations: [], services: [], packs: [] }),
  listAppointments: async () => [],
}));
vi.mock("@/lib/scheduling/day-availability", () => ({
  listTherapistBlocksAndHours: async () => ({ blocks: [], templates: [] }),
}));
// Two machines in the tenant, one at the therapist's clinic and one not: the
// panel needs BOTH (the server's create rule counts every machine in the
// tenant), which is not the list the drawer OFFERS (`sharedResources`).
vi.mock("@/lib/scheduling/shared-resources", () => ({
  listSharedResources: async () => {
    h.machineReads += 1;
    return [
      { id: "nesa-cb", label: "NESA", locationIds: ["loc-cb"] },
      { id: "nesa-lv", label: "NESA", locationIds: ["loc-lv"] },
    ];
  },
}));
vi.mock("./agenda-view", () => ({ AgendaView: () => null }));

import AgendaPage from "./page";

type Props = { options: { tenantSharedResourceIds?: string[] } };

async function optionsFor(role: string): Promise<Props["options"]> {
  h.ctx = { ...h.ctx, role };
  const el = (await AgendaPage({ searchParams: Promise.resolve({}) })) as { props: Props };
  expect(el.props.options, "the page returned the agenda view").toBeDefined();
  return el.props.options;
}

beforeEach(() => {
  h.machineReads = 0;
});

describe("Agenda: the panel's options carry the tenant's machines", () => {
  it("for a therapist, every machine in the tenant, from the one read the page already makes", async () => {
    expect((await optionsFor("therapist")).tenantSharedResourceIds).toEqual(["nesa-cb", "nesa-lv"]);
    expect(h.machineReads).toBe(1);
  });

  it.each(["reception", "admin", "owner"])("not for %s", async (role) => {
    expect((await optionsFor(role)).tenantSharedResourceIds).toBeUndefined();
  });
});
