/**
 * pedido-acceptance.test.ts — W14-02. The helper, and the WIRING of every door
 * that can accept a portal pedido.
 *
 * WHY SOURCE ARMS AND NOT A TEXTUAL REGISTER OF "status: confirmed" WRITES. The
 * obvious gate - scan the tree for every write that sets status 'confirmed' and
 * require each to be registered - cannot see the doors that matter:
 * updateAppointment writes the status through a computed object (`.set(set)`),
 * and the review queue through a shorthand variable (`{ status, ... }`). A regex
 * would register the literal writes and miss exactly the two that were silent.
 * So each known door is pinned by behaviour (pedido-confirm-emits.test.ts and the
 * two .db.test.ts suites) AND here by source: it must read pedido-ness BEFORE its
 * write and it must emit. A door that stops doing either reddens this file.
 *
 * The doors that CANNOT accept a pedido, and why, so nobody adds them here:
 *   - lib/reminders/confirm-redeem.ts and app/r/[token]/actions.ts confirm from a
 *     link inside a reminder or confirmation message, and dispatch.ts refuses
 *     both messages for an unaccepted pedido (dispatchReminder's
 *     isUnacceptedPedido gate, dispatchConfirmation's origin + unaccepted gates),
 *     so no such link ever reaches a pedido.
 *   - confirmAppointmentRequest is the original door and is pinned by the
 *     creation-path gate (creation-paths-emit-reminders.test.ts).
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("./reminders", () => ({ enqueueRemindersAfterCommit: vi.fn(async () => {}) }));

import { enqueueRemindersAfterCommit } from "./reminders";
import { emitAcceptedPedidoReminders } from "./pedido-acceptance";

const mockEnqueue = vi.mocked(enqueueRemindersAfterCommit);

beforeEach(() => {
  vi.clearAllMocks();
  mockEnqueue.mockImplementation(async () => {});
});

describe("emitAcceptedPedidoReminders", () => {
  it("emits the targets it is given, for the tenant it is given", async () => {
    const t = [{ appointmentId: "a-1", startsAt: new Date("2026-09-20T09:00:00Z") }];
    await emitAcceptedPedidoReminders("step", "tenant-A", t);
    expect(mockEnqueue).toHaveBeenCalledWith("tenant-A", t);
  });

  it("emits NOTHING for an empty list - a non-pedido confirm reaches here with []", async () => {
    await emitAcceptedPedidoReminders("step", "tenant-A", []);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("NEVER throws: the pedido is already accepted, so a failed enqueue is not a failed acceptance", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockEnqueue.mockRejectedValueOnce(new Error("patient +351912345678 unreachable"));
    await expect(
      emitAcceptedPedidoReminders("reviewResolve", "tenant-A", [
        { appointmentId: "a-1", startsAt: new Date() },
      ]),
    ).resolves.toBeUndefined();
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).toContain("reviewResolve");
    expect(logged).toContain("Error"); // the NAME
    expect(logged).not.toContain("912345678"); // never the message (CLAUDE.md rule 7)
    spy.mockRestore();
  });
});

/* ------------------------- the three doors, by source ------------------------ */

const ROOT = join(__dirname, "..", "..");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The text of one top-level function, from its declaration to the next top-level `}`. */
function body(relFile: string, fn: string): string {
  const lines = readFileSync(join(ROOT, relFile), "utf8").split("\n");
  const start = lines.findIndex((l) =>
    new RegExp(`^export\\s+async\\s+function\\s+${fn}\\b`).test(l),
  );
  if (start === -1) return "";
  const end = lines.findIndex((l, i) => i > start && l === "}");
  return strip(lines.slice(start, end + 1).join("\n"));
}

describe("W14-02 — every door that can accept a portal pedido emits, and only for a pedido", () => {
  it("updateAppointment (the Estado selector) reads pedido-ness before its write and enqueues it", () => {
    const b = body("lib/scheduling/actions.ts", "updateAppointment");
    expect(b.length).toBeGreaterThan(2000); // the extractor found the function
    expect(b).toContain("public.is_unconfirmed_pedido(");
    expect(b).toContain('patch.status === "confirmed"');
    expect(b).toContain("enqueueRemindersAfterCommit(actor.tenantId, reminderTargets)");
    // The pedido read precedes the UPDATE, or it answers false for every row.
    expect(b.indexOf("acceptedPedidos = affected.filter")).toBeLessThan(b.indexOf(".update(appointments)"));
  });

  it("resolveReviewItem (the SMS review queue) reads pedido-ness before its write and emits", () => {
    const b = body("lib/reminders/inbound-store.ts", "resolveReviewItem");
    expect(b.length).toBeGreaterThan(500);
    expect(b).toContain("isUnconfirmedPedido(tx,");
    expect(b).toContain("emitAcceptedPedidoReminders(");
    expect(b.indexOf("isUnconfirmedPedido(tx,")).toBeLessThan(b.indexOf(".update(appointments)"));
  });

  it("applyInboundReply (the patient's own SIM) reads pedido-ness before its write and emits", () => {
    const b = body("lib/reminders/inbound-reply.ts", "applyInboundReply");
    expect(b.length).toBeGreaterThan(1000);
    expect(b).toContain("isUnconfirmedPedido(tx, appt.id)");
    expect(b).toContain("emitAcceptedPedidoReminders(");
    expect(b.indexOf("isUnconfirmedPedido(tx, appt.id)")).toBeLessThan(
      b.indexOf('status: "confirmed"'),
    );
  });
});
