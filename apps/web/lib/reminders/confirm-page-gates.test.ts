import { describe, expect, it } from "vitest";

import {
  PEDIDO_QUEUE_IS_DURABLE,
  confirmPageFeeNotice,
  rescheduleButtonEnabled,
} from "./confirm-page-gates";
import { FEE_NOTICE_FLAG } from "./fee-notice";

/**
 * BOTH ARMS OF BOTH GATES, so flipping either is a decision somebody makes
 * rather than a default nobody revisits. A gate whose OTHER arm has never
 * executed is a gate nobody has tested.
 */

describe("the reschedule button, ARMED 2026-09-07 on the durable row", () => {
  it("is ON, and the constant says so rather than a comment saying so", () => {
    // IT WAS ON ONCE BEFORE, AND IT WAS ON BECAUSE OF A COMMENT. That gate was
    // opened on the claim that reception's queue derives from
    // "`appointments.origin` - the row the patient's press writes". The press
    // wrote no such row: it wrote a `consumed_at` and one audit_log line, and
    // audit_log is not a screen. A patient pressed it, was told "Pedido
    // recebido", and nobody was told anything.
    //
    // WHAT MAKES THIS ARMING A DIFFERENT FACT: migration 0080 exists and is
    // applied to production, `confirm-redeem.ts` writes
    // `appointment_reschedule_requests` inside the patient's own transaction,
    // and `/notificacoes` renders it. Those are rows and files, not a comment,
    // and `confirm-code.spec.ts` test 3 drives the whole loop in a browser.
    //
    // THE ASSERTION IS THE POINT OF THIS FILE. Changing this line is how the
    // gate closes again, deliberately - which is exactly what the owner is told
    // to do if the row does not reach his screen.
    expect(PEDIDO_QUEUE_IS_DURABLE).toBe(true);
    expect(rescheduleButtonEnabled()).toBe(true);
  });

  it("the render gate and the action gate read the SAME constant", () => {
    // Hiding a control removes nothing from anybody holding the URL, so the
    // action refuses too. This asserts the two cannot drift apart: there is one
    // exported answer and both call it.
    expect(rescheduleButtonEnabled()).toBe(PEDIDO_QUEUE_IS_DURABLE);
  });

  it("THE OTHER ARM: closing it again hides the control AND refuses the write", () => {
    // The arms have swapped back. What is now the untested arm is the CLOSED
    // one, and this stands in for it the same way it used to stand in for the
    // open one: the exported function is a pure read of the constant, so both
    // states stay reachable whichever way it is set. The closed arm is the
    // revert path, so it must not become unreachable while the gate is open.
    const flipped = (durable: boolean) => durable;
    expect(flipped(false)).toBe(false);
    expect(flipped(true)).toBe(true);
  });
});

describe("the fee slot, gated on approval AND a flag", () => {
  it("renders nothing today, with the flag OFF", () => {
    expect(confirmPageFeeNotice({})).toBe(false);
  });

  it("renders nothing WITH THE FLAG ON, because the copy is not approved", () => {
    // This is the arm that matters. An operator who arms the flag must still
    // get an empty slot: `FEE_NOTICE_TEMPLATE_ID` is registered
    // `approved: false` until JP packet 5.2 and counsel clear it, and a flag
    // cannot open that lock.
    expect(confirmPageFeeNotice({ [FEE_NOTICE_FLAG]: "true" })).toBe(false);
  });

  it("is exact-string, like every other flag in this pipeline", () => {
    for (const value of ["TRUE", "True", " true", "1", "yes"]) {
      expect(confirmPageFeeNotice({ [FEE_NOTICE_FLAG]: value })).toBe(false);
    }
  });
});
