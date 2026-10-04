/**
 * book-confirm-event-flow.test.ts - BOOK-CONFIRM, the acceptance marker.
 *
 * An acceptance and a reschedule of a portal appointment both arrive at the
 * confirmation dispatch as `appointment/scheduled` for a `confirmed`,
 * portal-origin row. Nothing on the row tells them apart, so the EVENT says
 * which it is: the four doors that can accept a pedido build their target with
 * `acceptedPedidoTarget`, the enqueue copies the marker onto the event, and the
 * Inngest function hands it to the dispatch.
 *
 * Each link is exercised against the real unit. The one seam that is faked is
 * `inngest.send`, the call that leaves the process, exactly as
 * acceptance-event-flow.test.ts does it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  sent: [] as { name: string; data: Record<string, unknown> }[],
  dispatchConfirmation: vi.fn(async (): Promise<unknown> => ({ dispatched: false, reason: "status" })),
}));

vi.mock("./inngest/client", async () => {
  const actual = await vi.importActual<typeof import("./inngest/client")>("./inngest/client");
  return {
    ...actual,
    inngest: {
      ...actual.inngest,
      send: vi.fn(async (e: { name: string; data: Record<string, unknown> }) => {
        h.sent.push(e);
      }),
      createFunction: actual.inngest.createFunction.bind(actual.inngest),
    },
  };
});
vi.mock("./dispatch", () => ({
  dispatchConfirmation: h.dispatchConfirmation,
  dispatchReminder: vi.fn(),
  dispatchFollowUp: vi.fn(),
  dispatchNoShow: vi.fn(),
}));

import { enqueueRemindersAfterCommit } from "@/lib/scheduling/reminders";
import { acceptedPedidoTarget } from "@/lib/scheduling/pedido-acceptance";
import {
  CONFIRMATION_IDEMPOTENCY_KEY,
  CONFIRMATION_TRIGGER_FILTER,
  sendAppointmentConfirmation,
} from "./inngest/functions";

const TENANT = "11111111-1111-4111-8111-111111111111";
const APPT = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const STARTS_AT = new Date("2031-05-14T13:30:00.000Z");

beforeEach(() => {
  h.sent.length = 0;
  h.dispatchConfirmation.mockClear();
});

/** Run the real handler of send-appointment-confirmation for one event. */
async function runConfirmation(data: Record<string, unknown>) {
  const handler = (
    sendAppointmentConfirmation as unknown as {
      fn: (ctx: {
        event: { data: Record<string, unknown> };
        step: { run: (name: string, f: () => unknown) => unknown };
      }) => Promise<unknown>;
    }
  ).fn;
  return handler({ event: { data }, step: { run: (_name, f) => f() } });
}

describe("the acceptance target carries the marker, and only it does", () => {
  it("acceptedPedidoTarget marks the target", () => {
    expect(acceptedPedidoTarget(APPT, STARTS_AT)).toEqual({
      appointmentId: APPT,
      startsAt: STARTS_AT,
      acceptedPedido: true,
    });
  });

  it("an ACCEPTANCE emits appointment/scheduled with acceptedPedido: true", async () => {
    await enqueueRemindersAfterCommit(TENANT, [acceptedPedidoTarget(APPT, STARTS_AT)]);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.name).toBe("appointment/scheduled");
    expect(h.sent[0]!.data).toEqual({
      appointmentId: APPT,
      tenantId: TENANT,
      startsAt: STARTS_AT.toISOString(),
      confirmationEligible: true,
      acceptedPedido: true,
    });
  });

  it("a RESCHEDULE emits the payload it always has: the key is absent, not false", async () => {
    // What rescheduleAppointment, createAppointment and the uncancel build.
    await enqueueRemindersAfterCommit(TENANT, [{ appointmentId: APPT, startsAt: STARTS_AT }]);
    expect(h.sent[0]!.data).toEqual({
      appointmentId: APPT,
      tenantId: TENANT,
      startsAt: STARTS_AT.toISOString(),
      confirmationEligible: true,
    });
    expect("acceptedPedido" in h.sent[0]!.data).toBe(false);
  });

  it("the marker is PER TARGET: an acceptance and an uncancel in one list stay distinct", async () => {
    const later = new Date(STARTS_AT.getTime() + 60 * 60_000);
    await enqueueRemindersAfterCommit(TENANT, [
      acceptedPedidoTarget(APPT, STARTS_AT),
      { appointmentId: OTHER, startsAt: later },
    ]);
    const byId = new Map(h.sent.map((e) => [e.data.appointmentId, e.data]));
    expect(byId.get(APPT)!.acceptedPedido).toBe(true);
    expect("acceptedPedido" in byId.get(OTHER)!).toBe(false);
  });
});

describe("send-appointment-confirmation hands the marker to the dispatch", () => {
  it("an acceptance event dispatches with acceptedPedido true", async () => {
    await runConfirmation({ appointmentId: APPT, tenantId: TENANT, acceptedPedido: true });
    expect(h.dispatchConfirmation).toHaveBeenCalledWith(TENANT, APPT, { acceptedPedido: true });
  });

  it("an event without the key dispatches with acceptedPedido false", async () => {
    await runConfirmation({ appointmentId: APPT, tenantId: TENANT });
    expect(h.dispatchConfirmation).toHaveBeenCalledWith(TENANT, APPT, { acceptedPedido: false });
  });

  it.each(["true", 1, {}, null])("a non-literal %j in the field is NOT an acceptance", async (value) => {
    await runConfirmation({ appointmentId: APPT, tenantId: TENANT, acceptedPedido: value });
    expect(h.dispatchConfirmation).toHaveBeenCalledWith(TENANT, APPT, { acceptedPedido: false });
  });

  it("the trigger filter and the idempotency key are the ones that were there", () => {
    // BOOK-CONFIRM keeps both. The key does not read the marker, so a duplicate
    // acceptance event for the same appointment and start is still one run.
    expect(CONFIRMATION_TRIGGER_FILTER).toBe("event.data.confirmationEligible == true");
    expect(CONFIRMATION_IDEMPOTENCY_KEY).toBe(
      'event.data.appointmentId + ":confirmation:" + event.data.startsAt',
    );
  });
});

/* ------------------- the doors, by source ------------------- */

const ROOT = join(__dirname, "..", "..");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The text of one top-level function, comments removed. */
function body(relFile: string, fn: string): string {
  const lines = readFileSync(join(ROOT, relFile), "utf8").split("\n");
  const start = lines.findIndex((l) =>
    new RegExp(`^export\\s+async\\s+function\\s+${fn}\\b`).test(l),
  );
  if (start === -1) return "";
  const end = lines.findIndex((l, i) => i > start && l === "}");
  return strip(lines.slice(start, end + 1).join("\n"));
}

describe("the four doors that can accept a pedido build their target with the marker", () => {
  it.each([
    ["lib/scheduling/actions.ts", "confirmAppointmentRequest", "acceptedPedidoTarget(pedido.id, pedido.startsAt)"],
    ["lib/scheduling/actions.ts", "updateAppointment", "acceptedPedidos.map((a) => acceptedPedidoTarget(a.id, a.startsAt))"],
    ["lib/reminders/inbound-store.ts", "resolveReviewItem", "acceptedPedidoTarget(updated[0]!.id, updated[0]!.startsAt)"],
    ["lib/reminders/inbound-reply.ts", "applyInboundReply", "acceptedPedidoTarget(appt.id, appt.startsAt)"],
  ])("%s %s", (file, fn, call) => {
    const b = body(file, fn);
    expect(b.length).toBeGreaterThan(500); // the extractor found the function
    expect(b).toContain(call);
  });

  it("updateAppointment does NOT mark the rows it brings back from Cancelada", () => {
    const b = body("lib/scheduling/actions.ts", "updateAppointment");
    const uncancel = b.slice(b.indexOf("...uncancelling"), b.indexOf("return { ok: true, data: { id } };"));
    expect(uncancel).toContain("appointmentId: a.id, startsAt: a.startsAt");
    expect(uncancel).not.toContain("acceptedPedido");
  });

  it.each(["createAppointment", "batchScheduleAppointments", "cloneAppointment", "rescheduleAppointment"])(
    "%s never marks its targets: it is not an acceptance",
    (fn) => {
      const b = body("lib/scheduling/actions.ts", fn);
      expect(b.length).toBeGreaterThan(500);
      // The marker and its one writer, as whole words: `unacceptedPedidoIds`
      // (the set a move filters OUT) is a different name and is allowed.
      expect(b).not.toMatch(/\bacceptedPedido/);
    },
  );

  it("nothing else in the app writes the marker by hand", () => {
    // The marker is written in exactly one function. A literal elsewhere would
    // be a fifth door, or a reschedule calling itself an acceptance.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "e2e") continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          const src = strip(readFileSync(full, "utf8"));
          if (/acceptedPedido:\s*true(?!\s*as const)/.test(src)) offenders.push(full.slice(ROOT.length + 1));
        }
      }
    };
    walk(join(ROOT, "lib"));
    walk(join(ROOT, "app"));
    expect(offenders.sort()).toEqual(["lib/scheduling/pedido-acceptance.ts", "lib/scheduling/reminders.ts"]);
  });
});
