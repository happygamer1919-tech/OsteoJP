/**
 * R44 (owner, 2026-11-02, option 1): the re-plan event a portal move sends.
 *
 *   1. The payload is the staff move's, field for field (apps/web/lib/reminders/
 *      index.ts `enqueueAppointmentReminders`, as `enqueueRemindersAfterCommit`
 *      calls it for a move), with `confirmationEligible` false: the owner
 *      ruled no fresh confirmation for a portal move. Ids and instants only.
 *   2. With NO event key (a preview, local, or before the owner adds
 *      INNGEST_EVENT_KEY to the osteojp-api project) the REAL Inngest client
 *      fails, the failure is logged by the error's name only, and the call
 *      resolves: the move it follows is never failed. The network is stubbed,
 *      so nothing leaves this machine.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const APPT = "22222222-2222-4222-8222-222222222222";
const PRAC = "33333333-3333-4333-8333-333333333333";
const NEW_START = new Date("2026-11-21T14:00:00.000Z");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.doUnmock("inngest");
  vi.resetModules();
});

describe("R44: the re-plan event's payload", () => {
  it("is the staff move's shape: the visit, the tenant, the new start, the Terapeuta, a save marker, no confirmation", async () => {
    const { portalMoveReplanData } = await import("./portal-move-replan");
    expect(
      portalMoveReplanData({ appointmentId: APPT, tenantId: TENANT, startsAt: NEW_START, practitionerId: PRAC, saveId: "s-1" }),
    ).toEqual({
      appointmentId: APPT,
      tenantId: TENANT,
      startsAt: "2026-11-21T14:00:00.000Z",
      practitionerId: PRAC,
      saveId: "s-1",
      confirmationEligible: false,
    });
  });

  it("is sent as appointment/scheduled, once, with a fresh uuid saveId per save and no other key", async () => {
    const sent: Array<{ name: string; data: Record<string, unknown> }> = [];
    vi.doMock("inngest", () => ({
      Inngest: class {
        send = async (e: { name: string; data: Record<string, unknown> }) => {
          sent.push(e);
          return { ids: ["x"] };
        };
      },
    }));
    const { replanAfterPortalMove } = await import("./portal-move-replan");
    await replanAfterPortalMove({ appointmentId: APPT, tenantId: TENANT, startsAt: NEW_START, practitionerId: PRAC });
    await replanAfterPortalMove({ appointmentId: APPT, tenantId: TENANT, startsAt: NEW_START, practitionerId: PRAC });
    expect(sent).toHaveLength(2);
    expect(sent[0]!.name).toBe("appointment/scheduled");
    expect(Object.keys(sent[0]!)).toEqual(["name", "data"]);
    expect(Object.keys(sent[0]!.data).sort()).toEqual(
      ["appointmentId", "confirmationEligible", "practitionerId", "saveId", "startsAt", "tenantId"],
    );
    expect(sent[0]!.data.confirmationEligible).toBe(false);
    expect(sent[0]!.data.saveId).toMatch(UUID);
    expect(sent[1]!.data.saveId).toMatch(UUID);
    expect(sent[0]!.data.saveId).not.toBe(sent[1]!.data.saveId);
  });

  it("the staff sender's payload has the same keys (apps/web/lib/reminders/index.ts)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "..", "..", "..", "web", "lib", "reminders", "index.ts"), "utf8");
    const send = src.slice(src.indexOf("name: EVENT_APPOINTMENT_SCHEDULED,"));
    for (const line of [
      "appointmentId: args.appointmentId,",
      "tenantId: args.tenantId,",
      "startsAt: args.startsAt.toISOString(),",
      "practitionerId: args.practitionerId,",
      "saveId: args.saveId,",
      "confirmationEligible: args.confirmationEligible,",
    ]) {
      expect(send, line).toContain(line);
    }
  });
});

describe("R44: with no event key, the send fails quietly and by name only", () => {
  it("the real client, no INNGEST_EVENT_KEY, network stubbed: resolves, logs the error name, never the cause", async () => {
    expect(process.env.INNGEST_EVENT_KEY).toBeUndefined();
    expect(process.env.INNGEST_DEV).toBeUndefined();
    const fetchSpy = vi.fn(async () => {
      throw new TypeError("network stubbed in this test");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const errors: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    const { replanAfterPortalMove } = await import("./portal-move-replan");
    await expect(
      replanAfterPortalMove({ appointmentId: APPT, tenantId: TENANT, startsAt: NEW_START, practitionerId: PRAC }),
    ).resolves.toBeUndefined();

    const ours = errors.filter((a) => a[0] === "portal: reminder re-plan failed");
    expect(ours).toHaveLength(1);
    expect(ours[0]).toHaveLength(2);
    // The error's NAME: a short identifier, no message, no id, no instant.
    expect(ours[0]![1]).toMatch(/^[A-Za-z]+$/);
    // Measured 2026-11-02 on inngest 4.5.0: with no key the client refuses
    // before any request, so nothing is sent anywhere.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
