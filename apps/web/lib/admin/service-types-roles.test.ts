import { vi, describe, it, expect, beforeEach } from "vitest";

/**
 * Tipos de Marcacao: who may write. The REAL permission matrix
 * (@osteojp/auth, not mocked): `services:write` is held by the owner and the
 * admin only, so a therapist or a receptionist is refused by each of the three
 * writes this screen uses, BEFORE any database call. The database is a spy
 * that records whether it was reached.
 */

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({ reached: 0 }));

vi.mock("@/lib/auth/context", () => ({
  runScoped: vi.fn(async () => {
    H.reached += 1;
  }),
}));

vi.mock("./audit", () => ({ writeAudit: vi.fn(async () => undefined) }));

import { ForbiddenError } from "@osteojp/auth";
import { createService, saveServiceTypesTable, setServiceContraindicationSensitive } from "./services";

const ID = "11111111-1111-4111-8111-111111111111";
const as = (role: string) => ({ tenantId: "tenant-A", role, userId: "user-1" }) as never;

const row = {
  id: ID,
  name: "Fisioterapia",
  priceCents: 5000,
  vatRate: null,
  vatExemptionCode: null,
  isActive: true,
  color: null,
  smsReminders: true,
  patientBookable: false,
  durationMin: 45,
  seenUpdatedAtMs: 0,
};

const writes = {
  saveServiceTypesTable: (role: string) => saveServiceTypesTable(as(role), [row]),
  createService: (role: string) =>
    createService(as(role), { name: "Pilates", durationMin: 50, priceCents: 5000, vatRate: 0, vatExemptionCode: "M07" }),
  setServiceContraindicationSensitive: (role: string) => setServiceContraindicationSensitive(as(role), ID, true),
};

beforeEach(() => {
  H.reached = 0;
});

describe("therapist and reception are refused every Tipos de Marcacao write", () => {
  for (const [name, write] of Object.entries(writes)) {
    for (const role of ["therapist", "reception"]) {
      it(`${name} refuses ${role} before the database`, async () => {
        await expect(write(role)).rejects.toBeInstanceOf(ForbiddenError);
        expect(H.reached).toBe(0);
      });
    }
    for (const role of ["owner", "admin"]) {
      it(`${name} lets ${role} through to the database`, async () => {
        await write(role);
        expect(H.reached).toBe(1);
      });
    }
  }
});

describe("B10 (strategy 2026-11-05): both writers of the Motivo refuse it on a rate above 0%, before the database", () => {
  for (const vatRate of [6, 13, 23] as const) {
    it(`createService refuses ${vatRate}% with a Motivo`, async () => {
      await expect(
        createService(as("admin"), { name: "Pilates", durationMin: 50, priceCents: 5000, vatRate, vatExemptionCode: "M07" }),
      ).rejects.toMatchObject({ field: "vatReasonNotExempt" });
      expect(H.reached).toBe(0);
    });
    it(`saveServiceTypesTable refuses ${vatRate}% with a Motivo`, async () => {
      await expect(
        saveServiceTypesTable(as("admin"), [{ ...row, vatRate, vatExemptionCode: "M07" }]),
      ).rejects.toMatchObject({ field: "vatReasonNotExempt" });
      expect(H.reached).toBe(0);
    });
  }
  it("createService admits 23% with no Motivo", async () => {
    await createService(as("admin"), { name: "Pilates", durationMin: 50, priceCents: 5000, vatRate: 23, vatExemptionCode: null });
    expect(H.reached).toBe(1);
  });
});
