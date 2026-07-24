import { describe, expect, it } from "vitest";

import {
  deriveEstado,
  estadoStrikesName,
  ESTADO_COLOR_CLASS,
  ESTADO_LABEL_KEY,
  ESTADOS,
  type Estado,
} from "./estado";
import type {
  AppointmentConfirmationStateValue,
  AppointmentStatusValue,
} from "./types";

// W12-11 R10: the estado is a PURE derivation over the two orthogonal axes
// (lifecycle status + confirmation state). It reads both and writes neither.

describe("deriveEstado — five estados over the two axes (SPEC §2.1)", () => {
  it("terminal lifecycle states dominate regardless of the confirmation axis", () => {
    const confirmations: AppointmentConfirmationStateValue[] = [
      "pending",
      "confirmed",
      "declined",
    ];
    for (const c of confirmations) {
      expect(deriveEstado("completed", c)).toBe("concluida");
      expect(deriveEstado("cancelled", c)).toBe("cancelada");
      expect(deriveEstado("no_show", c)).toBe("falta");
    }
  });

  it("scheduled + pending -> Agendada", () => {
    expect(deriveEstado("scheduled", "pending")).toBe("agendada");
  });

  it("patient confirmation OR staff-set confirmed status -> Confirmada (both notions, §2.2)", () => {
    expect(deriveEstado("scheduled", "confirmed")).toBe("confirmada");
    expect(deriveEstado("confirmed", "pending")).toBe("confirmada");
    expect(deriveEstado("confirmed", "confirmed")).toBe("confirmada");
  });

  it("a declined confirmation on a still-scheduled appointment maps to Cancelada (§4.4)", () => {
    expect(deriveEstado("scheduled", "declined")).toBe("cancelada");
  });

  it("covers every (status, confirmation) pair with a valid estado", () => {
    const statuses: AppointmentStatusValue[] = [
      "scheduled",
      "confirmed",
      "completed",
      "cancelled",
      "no_show",
    ];
    const confirmations: AppointmentConfirmationStateValue[] = [
      "pending",
      "confirmed",
      "declined",
    ];
    for (const st of statuses) {
      for (const c of confirmations) {
        expect(ESTADOS).toContain(deriveEstado(st, c));
      }
    }
  });
});

describe("estadoStrikesName — R10 strikethrough belongs to Falta only", () => {
  it("strikes the name for Falta and for NO other estado (Cancelada never strikes)", () => {
    expect(estadoStrikesName("falta")).toBe(true);
    for (const e of ["agendada", "confirmada", "concluida", "cancelada"] as Estado[]) {
      expect(estadoStrikesName(e)).toBe(false);
    }
  });
});

describe("estado presentation maps (colour-not-only)", () => {
  it("has a label key and a colour class for every estado", () => {
    for (const e of ESTADOS) {
      expect(ESTADO_LABEL_KEY[e]).toBeTruthy();
      expect(ESTADO_COLOR_CLASS[e]).toMatch(/^text-/);
    }
  });

  it("uses green for confirmed/completed, red for cancelled/falta, yellow for agendada", () => {
    expect(ESTADO_COLOR_CLASS.agendada).toBe("text-warning");
    expect(ESTADO_COLOR_CLASS.confirmada).toBe("text-success");
    expect(ESTADO_COLOR_CLASS.concluida).toBe("text-success");
    expect(ESTADO_COLOR_CLASS.cancelada).toBe("text-error");
    expect(ESTADO_COLOR_CLASS.falta).toBe("text-error");
  });
});
