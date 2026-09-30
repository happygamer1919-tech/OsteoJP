import { readFileSync } from "node:fs";
import { join } from "node:path";

import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isUseServerModule, stripComments } from "@/lib/testing/module-graph";

/**
 * SKEW-01 PR 2 - the "use server" loader. The actions it composes are mocked
 * here, so these tests pin the COMPOSITION: each piece is the existing action,
 * called with the arguments the drawer used to POST to it, and nothing else.
 * What each action checks is that action's own code and tests, unchanged.
 */

const calls = vi.hoisted(() => [] as string[]);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/scheduling/actions", () => ({
  getTherapistDayAvailability: vi.fn(async (input: unknown) => {
    calls.push(`availability ${JSON.stringify(input)}`);
    return { ok: true, data: { date: "2026-10-01", working: [], booked: [], blocks: [], closures: [], free: [] } };
  }),
}));
vi.mock("@/lib/patients/actions", () => ({
  getAppointmentNotesAction: vi.fn(async (id: string) => {
    calls.push(`notes ${id}`);
    return { ok: true, notes: [] };
  }),
  getPatientContraindications: vi.fn(async (id: string) => {
    calls.push(`contraindications ${id}`);
    return { epilepsy: false, pregnancy: false, pacemaker: true };
  }),
  getPatientNoSmsReason: vi.fn(async (id: string) => {
    calls.push(`noSms ${id}`);
    return "landline";
  }),
}));
vi.mock("@/lib/packs/actions", () => ({
  listLinkablePacksAction: vi.fn(async (id: string) => {
    calls.push(`linkable ${id}`);
    return { blocked: null, linkedTo: null, options: [] };
  }),
}));
const capture = vi.hoisted(() => vi.fn());
vi.mock("@sentry/nextjs", () => ({ captureException: capture }));

import * as loaderModule from "./drawer-load";
import { loadAppointmentDrawer } from "./drawer-load";
import { getPatientNoSmsReason } from "@/lib/patients/actions";

const INPUT = {
  appointmentId: "appt-1",
  patientId: "pat-1",
  therapistId: "ther-1",
  date: "2026-10-01",
  locationId: "loc-1",
};

beforeEach(() => {
  calls.length = 0;
  capture.mockClear();
});

describe("loadAppointmentDrawer", () => {
  it("calls the five existing actions, one after another, with the arguments the drawer used to send", async () => {
    const out = await loadAppointmentDrawer(INPUT);
    expect(calls).toEqual([
      // AvailabilityPanel sent `locationId: locationId || null`.
      'availability {"therapistId":"ther-1","date":"2026-10-01","locationId":"loc-1"}',
      "notes appt-1",
      "contraindications pat-1",
      "noSms pat-1",
      "linkable appt-1",
    ]);
    expect(out.noSms).toEqual({ status: "ok", value: "landline" });
    expect(out.contraindications).toEqual({ status: "ok", value: { epilepsy: false, pregnancy: false, pacemaker: true } });
  });

  it("sends an empty location as null, exactly as the panel did", async () => {
    await loadAppointmentDrawer({ ...INPUT, locationId: "" });
    expect(calls[0]).toBe('availability {"therapistId":"ther-1","date":"2026-10-01","locationId":null}');
  });

  it("a piece that throws is that piece's error only, reported with the piece name and no id", async () => {
    vi.mocked(getPatientNoSmsReason).mockRejectedValueOnce(new Error("forbidden"));
    const out = await loadAppointmentDrawer(INPUT);
    expect(out.noSms).toEqual({ status: "error" });
    expect(out.linkable.status).toBe("ok");
    expect(capture).toHaveBeenCalledTimes(1);
    const [, context] = capture.mock.calls[0]!;
    expect(context).toEqual({ tags: { server_action: "drawer-loader", piece: "noSms" } });
    expect(JSON.stringify(context)).not.toMatch(/appt-1|pat-1|ther-1/);
  });

  it("an expired session's redirect leaves the loader, as it leaves the action today", async () => {
    vi.mocked(getPatientNoSmsReason).mockImplementationOnce(async () => redirect("/login"));
    await expect(loadAppointmentDrawer(INPUT)).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;/),
    });
    expect(capture).not.toHaveBeenCalled();
    expect(calls).not.toContain("linkable appt-1");
  });

  it("reads a forged body as empty ids and calls no action for them", async () => {
    const out = await loadAppointmentDrawer({ appointmentId: 1, patientId: null });
    expect(calls).toEqual([]);
    for (const piece of Object.values(out)) expect(piece).toEqual({ status: "skipped" });
  });
});

describe("the module's browser-callable surface", () => {
  it("exports exactly one thing, the loader: every export of a 'use server' module is a POST endpoint", () => {
    expect(Object.keys(loaderModule).sort()).toEqual(["loadAppointmentDrawer"]);
  });

  it("is a 'use server' module whose code calls no database helper of its own", () => {
    const file = join(__dirname, "drawer-load.ts");
    expect(isUseServerModule(file)).toBe(true);
    const code = stripComments(readFileSync(file, "utf8"));
    // Composition only: no query, no scope predicate, no second guard.
    expect(code).not.toMatch(/\brunScoped\b|\brequireRequestContext\b|\bassertCan\b|@osteojp\/db|drizzle-orm/);
  });
});
