/**
 * LE-staff-transitions-emit-nothing — cancel and reschedule now emit.
 *
 * ============================================================================
 * WHAT THE GAP WAS
 * ============================================================================
 * `0061` added ONE kind, `confirmed`, and instrumented ONE path. The owner's
 * ruling was deliberately narrow because that path had a demonstrated defect: a
 * therapist accepting a pedido made it VANISH from reception's live queue with
 * nothing written anywhere.
 *
 * A staff member cancelling or rescheduling still emitted nothing. Reception
 * sees those on the agenda, which is why it was a gap rather than an incident —
 * but the asymmetry was in the code, and a reader would reasonably assume the
 * fan-out was complete.
 *
 * ============================================================================
 * NO MIGRATION, AND THAT IS WHY THESE TWO COULD SHIP AND NO-SHOW COULD NOT
 * ============================================================================
 * `cancelled` and `rescheduled` have been in `0055`'s CHECK constraint since the
 * table existed and were simply never emitted. **`no_show` has no kind at all**,
 * so it needs a migration and therefore an owner ruling under the WF-04
 * precedent. It is carded separately and is deliberately absent from
 * `StaffTransitionKind` — widening that union without widening the constraint
 * would move the failure from a compile error to a runtime insert violation on a
 * staff click.
 *
 * ============================================================================
 * WHAT IS ASSERTED HERE, AND WHAT IS ASSERTED IN confirm-fanout.test.ts
 * ============================================================================
 * The recipient rule and the actor exclusion live in ONE shared function now, so
 * they are asserted once, there. This file asserts what is specific to the two
 * new kinds: that they write the right `kind`, and that **reschedule is the only
 * one whose two instants differ** — which is the entire reason
 * `staff_notifications` carries the column pair.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  /** Rows handed to the insert, flattened. */
  inserted: [] as Array<Record<string, unknown>>,
  /** Recipient rows the two recipient queries return. */
  recipients: [{ id: "u-reception" }] as Array<{ id: string }>,
}));

vi.mock("server-only", () => ({}));

vi.mock("@osteojp/db", async (orig) => {
  const real = await orig<typeof import("@osteojp/db")>();
  return {
    ...real,
    getDbAdmin: () => ({
      select: () => {
        const chain: Record<string, unknown> = {
          from: () => chain,
          innerJoin: () => chain,
          where: async () => H.recipients,
        };
        return chain;
      },
      insert: () => ({
        values: (rows: Array<Record<string, unknown>>) => {
          H.inserted.push(...rows);
          return { onConflictDoNothing: async () => [] };
        },
      }),
    }),
  };
});

import {
  emitCancelledNotification,
  emitConfirmedNotification,
  emitRescheduledNotification,
} from "./centre";

const BASE = {
  tenantId: "t-1",
  actorUserId: "u-actor",
  appointmentId: "a-1",
  patientId: "p-1",
  practitionerIds: [] as string[],
  occurredAt: new Date("2026-08-13T10:00:00Z"),
};
const OLD_START = new Date("2026-08-20T09:00:00Z");
const NEW_START = new Date("2026-08-21T15:30:00Z");

beforeEach(() => {
  H.inserted = [];
  H.recipients = [{ id: "u-reception" }];
});

describe("guard on the guard: the harness is not vacuously passing", () => {
  it("a confirm still writes a row, so an empty `inserted` means something", async () => {
    // Every "the kind is X" assertion below would pass on an empty array if the
    // harness never captured an insert.
    const r = await emitConfirmedNotification({ ...BASE, startsAt: OLD_START });
    expect(r.delivered).toBe(true);
    expect(H.inserted).toHaveLength(1);
  });

  it("writes NOTHING when the fan-out resolves no recipients", async () => {
    // The one legitimate zero, and it must not look like a successful emit.
    H.recipients = [];
    const r = await emitCancelledNotification({ ...BASE, startsAt: OLD_START });
    expect(r.delivered).toBe(false);
    expect(H.inserted).toHaveLength(0);
  });
});

describe("cancel emits, and says so", () => {
  it("writes kind `cancelled`", async () => {
    await emitCancelledNotification({ ...BASE, startsAt: OLD_START });
    expect(H.inserted[0]!.kind).toBe("cancelled");
  });

  it("carries the SAME instant on both ends, because a cancellation moves nothing", async () => {
    await emitCancelledNotification({ ...BASE, startsAt: OLD_START });
    expect(H.inserted[0]!.previousStartsAt).toEqual(OLD_START);
    expect(H.inserted[0]!.newStartsAt).toEqual(OLD_START);
  });
});

describe("reschedule emits, and it is the ONLY kind whose instants differ", () => {
  it("writes kind `rescheduled`", async () => {
    await emitRescheduledNotification({
      ...BASE,
      previousStartsAt: OLD_START,
      newStartsAt: NEW_START,
    });
    expect(H.inserted[0]!.kind).toBe("rescheduled");
  });

  it("records what it moved FROM as well as TO", async () => {
    // THE ASSERTION THAT JUSTIFIES THE COLUMN PAIR. A reader of the notification
    // centre needs the old instant; by the time the emit runs, the row itself
    // already holds the new one, so only the caller can supply it. An
    // implementation that read the appointment again here would report that it
    // moved from where it now is — true, useless, and impossible to spot from
    // the screen.
    await emitRescheduledNotification({
      ...BASE,
      previousStartsAt: OLD_START,
      newStartsAt: NEW_START,
    });
    expect(H.inserted[0]!.previousStartsAt).toEqual(OLD_START);
    expect(H.inserted[0]!.newStartsAt).toEqual(NEW_START);
    expect(
      H.inserted[0]!.previousStartsAt,
      "if these are equal the reschedule notification says nothing moved",
    ).not.toEqual(H.inserted[0]!.newStartsAt);
  });
});

describe("every kind records the actor, so the centre can attribute the change", () => {
  it.each([
    ["confirmed", () => emitConfirmedNotification({ ...BASE, startsAt: OLD_START })],
    ["cancelled", () => emitCancelledNotification({ ...BASE, startsAt: OLD_START })],
    [
      "rescheduled",
      () =>
        emitRescheduledNotification({
          ...BASE,
          previousStartsAt: OLD_START,
          newStartsAt: NEW_START,
        }),
    ],
  ] as const)("%s carries actorUserId and the appointment", async (_kind, emit) => {
    await emit();
    expect(H.inserted[0]!.actorUserId).toBe("u-actor");
    expect(H.inserted[0]!.appointmentId).toBe("a-1");
    expect(H.inserted[0]!.patientId).toBe("p-1");
    expect(H.inserted[0]!.tenantId).toBe("t-1");
  });
});
