/**
 * acceptance-after-reschedule.test.ts - A DEFECT, RECORDED AND NOT FIXED HERE.
 *
 * Found while building BOOK-CONFIRM, reading the path an acceptance takes.
 *
 * THE SEQUENCE. Reception moves an online request to another time BEFORE
 * accepting it, then accepts it within 24 hours:
 *
 *   1. `rescheduleAppointment` emits `appointment/scheduled` for the request at
 *      its NEW start. It emits for every row it moves and does not ask whether
 *      the row is an unaccepted request (lib/scheduling/actions.ts).
 *   2. send-appointment-confirmation runs for that event. The request is still
 *      `scheduled`, so `dispatchConfirmation` answers `unconfirmed` and sends
 *      nothing. The run's idempotency key is now spent:
 *      appointmentId + ":confirmation:" + startsAt.
 *   3. Reception accepts. The acceptance emits `appointment/scheduled` for the
 *      SAME appointment at the SAME start, so the key is IDENTICAL, and Inngest
 *      drops a second run with a key it has seen in the last 24 hours.
 *
 * The patient gets no confirmation, and nothing anywhere records one being
 * attempted. The same holds when a request is brought back from Cancelada
 * before being accepted (updateAppointment emits for it without the marker).
 *
 * WHY `it.fails`. The last arm states the property that SHOULD hold and does
 * not. It is marked as a known failure so the suite stays green while the
 * defect stands, and it turns RED the day the keys differ, which is the signal
 * to delete the marker. It is evidence, not a fix: BOOK-CONFIRM was told to
 * keep the existing idempotency, and whether this explains any production case
 * is a question for the production measurement, not for this file.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  sent: [] as { name: string; data: Record<string, unknown> }[],
  loadReminderData: vi.fn(),
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
vi.mock("./data", () => ({ loadReminderData: h.loadReminderData }));
vi.mock("./dispatch-ledger", () => ({
  recordDispatch: vi.fn(async () => {}),
  hasHandedOverDispatch: vi.fn(async () => false),
}));

import { enqueueRemindersAfterCommit } from "@/lib/scheduling/reminders";
import { acceptedPedidoTarget } from "@/lib/scheduling/pedido-acceptance";
import { dispatchConfirmation } from "./dispatch";
import { CONFIRMATION_IDEMPOTENCY_KEY } from "./inngest/functions";

const TENANT = "11111111-1111-4111-8111-111111111111";
const APPT = "22222222-2222-4222-8222-222222222222";
const NEW_START = new Date("2031-05-14T13:30:00.000Z");

/**
 * Evaluate the key expression for one event. The expression is a string
 * Inngest evaluates; it is a `+` chain of `event.data.<field>` reads and quoted
 * literals, and this reads exactly that shape and throws on anything else, so a
 * future expression this cannot read fails loudly instead of being guessed at.
 */
function idempotencyKey(expression: string, data: Record<string, unknown>): string {
  return expression
    .split("+")
    .map((part) => part.trim())
    .map((part) => {
      const field = /^event\.data\.([A-Za-z]+)$/.exec(part);
      if (field) return String(data[field[1]!]);
      const literal = /^"([^"]*)"$/.exec(part);
      if (literal) return literal[1]!;
      throw new Error(`cannot evaluate idempotency key part ${JSON.stringify(part)}`);
    })
    .join("");
}

beforeEach(() => {
  h.sent.length = 0;
  h.loadReminderData.mockReset();
});

describe("a reschedule BEFORE acceptance spends the confirmation's idempotency key", () => {
  it("rescheduleAppointment emits for every row it moves, pedido or not", () => {
    const src = readFileSync(join(__dirname, "..", "scheduling", "actions.ts"), "utf8");
    const start = src.indexOf("export async function rescheduleAppointment");
    const end = src.indexOf("export async function confirmAppointmentRequest");
    const body = src.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(body.length).toBeGreaterThan(2000);
    expect(body).toContain("reminderTargets = targets.map(");
    expect(body).toContain("enqueueRemindersAfterCommit(actor.tenantId, reminderTargets)");
    // No pedido question is asked anywhere in the function.
    expect(body).not.toContain("is_unconfirmed_pedido");
    expect(body).not.toContain("isUnconfirmedPedido");
  });

  it("the run that event starts sends nothing: the request is not accepted yet", async () => {
    h.loadReminderData.mockResolvedValue({
      appointmentId: APPT,
      startsAt: NEW_START,
      status: "scheduled",
      origin: "patient_portal",
      patientId: "33333333-3333-4333-8333-333333333333",
      patientDeletedAt: null,
    });
    expect(await dispatchConfirmation(TENANT, APPT)).toEqual({
      dispatched: false,
      reason: "unconfirmed",
    });
  });

  it("the control: two deliveries of the SAME acceptance share a key, which is the dedupe working", async () => {
    await enqueueRemindersAfterCommit(TENANT, [acceptedPedidoTarget(APPT, NEW_START)]);
    await enqueueRemindersAfterCommit(TENANT, [acceptedPedidoTarget(APPT, NEW_START)]);
    const [first, second] = h.sent.map((e) => idempotencyKey(CONFIRMATION_IDEMPOTENCY_KEY, e.data));
    expect(first).toBe(`${APPT}:confirmation:${NEW_START.toISOString()}`);
    expect(second).toBe(first);
  });

  it.fails(
    "KNOWN DEFECT: the acceptance's key should differ from the earlier reschedule's, and does not",
    async () => {
      // What rescheduleAppointment emits for the request at its new start.
      await enqueueRemindersAfterCommit(TENANT, [{ appointmentId: APPT, startsAt: NEW_START }]);
      // What the acceptance emits afterwards, same appointment, same start.
      await enqueueRemindersAfterCommit(TENANT, [acceptedPedidoTarget(APPT, NEW_START)]);

      const [reschedule, acceptance] = h.sent;
      expect(reschedule!.data.confirmationEligible).toBe(true);
      expect(acceptance!.data.confirmationEligible).toBe(true);
      // The property that would let the acceptance's confirmation run. Today
      // both evaluate to the same string, so Inngest drops the second run.
      expect(idempotencyKey(CONFIRMATION_IDEMPOTENCY_KEY, acceptance!.data)).not.toBe(
        idempotencyKey(CONFIRMATION_IDEMPOTENCY_KEY, reschedule!.data),
      );
    },
  );
});
