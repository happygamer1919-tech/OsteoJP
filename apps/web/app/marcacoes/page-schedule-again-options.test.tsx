/**
 * page-schedule-again-options.test.tsx (Marcacoes): U6. THE PAGE HANDS ITS
 * APPOINTMENT PANEL THE TENANT'S MACHINES, FOR A THERAPIST ONLY.
 *
 * The panel hides "Marcar novamente" with scheduleAgainForbidden, which needs
 * the ids of the tenant's shared resources (NESA) to let a therapist copy a
 * NESA visit as the server does. The REAL page runs here with its reads
 * stubbed, and the options it hands MarcacoesView are read off the element it
 * returns. The machine list is a stub that answers like the real one: ids for
 * a therapist, undefined (and no read) for everyone else.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  ctx: { tenantId: "t-1", role: "therapist", userId: "u-self" } as { tenantId: string; role: string; userId: string },
  machineReads: 0,
}));

vi.mock("@/lib/auth/context", () => ({ requireRequestContext: async () => h.ctx }));
vi.mock("@/lib/admin/services", () => ({ listServices: async () => [] }));
vi.mock("@/lib/auth/viewer-locations", () => ({ viewerLocationScope: async () => null }));
vi.mock("@/lib/scheduling/data", () => ({
  getAgendaOptions: async () => ({ therapists: [], locations: [], bookableLocations: [], services: [], packs: [] }),
  getAppointment: async () => null,
  listAppointmentNotePreviews: async () => new Map(),
  listAppointments: async () => [],
}));
vi.mock("@/lib/scheduling/shared-resources", () => ({
  tenantSharedResourceIdsFor: async (ctx: { role: string }) => {
    if (ctx.role !== "therapist") return undefined;
    h.machineReads += 1;
    return ["nesa-cb"];
  },
}));
vi.mock("./marcacoes-view", () => ({ MarcacoesView: () => null }));

import MarcacoesPage from "./page";

type Props = { options: { tenantSharedResourceIds?: string[] } };

async function optionsFor(role: string): Promise<Props["options"]> {
  h.ctx = { ...h.ctx, role };
  const el = (await MarcacoesPage({ searchParams: Promise.resolve({}) })) as { props: Props };
  expect(el.props.options, "the page returned the list view").toBeDefined();
  return el.props.options;
}

beforeEach(() => {
  h.machineReads = 0;
});

describe("Marcacoes: the panel's options carry the tenant's machines", () => {
  it("for a therapist", async () => {
    expect((await optionsFor("therapist")).tenantSharedResourceIds).toEqual(["nesa-cb"]);
    expect(h.machineReads).toBe(1);
  });

  it.each(["reception", "admin", "owner"])("not for %s, and nothing is read", async (role) => {
    expect((await optionsFor(role)).tenantSharedResourceIds).toBeUndefined();
    expect(h.machineReads).toBe(0);
  });
});
