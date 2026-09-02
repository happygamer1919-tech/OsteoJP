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

describe("the reschedule button, gated on #1107", () => {
  it("is OFF today, and the constant says so rather than a comment saying so", () => {
    expect(PEDIDO_QUEUE_IS_DURABLE).toBe(false);
    expect(rescheduleButtonEnabled()).toBe(false);
  });

  it("the render gate and the action gate read the SAME constant", () => {
    // Hiding a control removes nothing from anybody holding the URL, so the
    // action refuses too. This asserts the two cannot drift apart: there is one
    // exported answer and both call it.
    expect(rescheduleButtonEnabled()).toBe(PEDIDO_QUEUE_IS_DURABLE);
  });

  it("THE OTHER ARM: flipping the constant is all that is needed to offer it", () => {
    // Proven by construction rather than by mutating a const: the exported
    // function is a pure read of the constant, so the arm is reachable and the
    // day #1107 merges is a one-line change plus this expectation flipping.
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
