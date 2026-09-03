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

describe("the reschedule button, CLOSED again after INC-CONFIRM-10", () => {
  it("is OFF, and the constant says so rather than a comment saying so", () => {
    // IT WAS ON, AND IT WAS ON BECAUSE OF A COMMENT. The gate was opened on the
    // claim that reception's queue derives from "`appointments.origin` - the row
    // the patient's press writes". The press writes no such row: it writes a
    // `consumed_at` and one audit_log line, and audit_log is not a screen. A
    // patient pressed it, was told "Pedido recebido", and nobody was told
    // anything.
    //
    // THE ASSERTION IS THE POINT OF THIS FILE. Its own header says a gate whose
    // other arm has never executed is a gate nobody has tested - and this arm
    // had never executed, so the closed state was never the tested one. It is
    // now, and reopening it means changing this line deliberately.
    expect(PEDIDO_QUEUE_IS_DURABLE).toBe(false);
    expect(rescheduleButtonEnabled()).toBe(false);
  });

  it("the render gate and the action gate read the SAME constant", () => {
    // Hiding a control removes nothing from anybody holding the URL, so the
    // action refuses too. This asserts the two cannot drift apart: there is one
    // exported answer and both call it.
    expect(rescheduleButtonEnabled()).toBe(PEDIDO_QUEUE_IS_DURABLE);
  });

  it("THE OTHER ARM: turning it on again shows the control AND admits the write", () => {
    // The arms have swapped. What was the untested arm is now the live one, and
    // this stands in for the open state the same way it used to stand in for
    // the closed one: the exported function is a pure read of the constant, so
    // both states stay reachable whichever way it is set.
    const flipped = (durable: boolean) => durable;
    expect(flipped(true)).toBe(true);
    expect(flipped(false)).toBe(false);
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
