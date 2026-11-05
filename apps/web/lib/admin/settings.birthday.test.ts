import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({ writeAudit: vi.fn(async () => {}) }));

import type { RequestContext } from "@osteojp/auth";
import { runScoped } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { setBirthdayHeaderIcon } from "./settings";

/**
 * Indicação de Aniversários: the switch's save. Owner and admin only, and it
 * keeps every other key of the settings blob. The real-database half is in
 * lib/patients/birthdays.db.test.ts.
 */

const mockRunScoped = vi.mocked(runScoped);
const mockAudit = vi.mocked(writeAudit);

const ctx = (role: RequestContext["role"]): RequestContext => ({ tenantId: "t-1", role, userId: "u-1" });

function fakeTx(existing: Record<string, unknown>) {
  const writes: unknown[] = [];
  mockRunScoped.mockImplementation(async (_c, fn) => {
    const select = () => ({ from: () => ({ for: async () => [{ settings: existing }] }) });
    const update = () => ({
      set: async (v: unknown) => {
        writes.push(v);
      },
    });
    return fn({ select, update } as never);
  });
  return writes;
}

beforeEach(() => {
  mockRunScoped.mockReset();
  mockAudit.mockClear();
});

describe("setBirthdayHeaderIcon", () => {
  it.each(["therapist", "reception"] as const)("refuses a %s before any read or write", async (role) => {
    fakeTx({});
    await expect(setBirthdayHeaderIcon(ctx(role), true)).rejects.toThrow();
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it.each(["owner", "admin"] as const)("lets the %s switch it, keeping every other key", async (role) => {
    const writes = fakeTx({ locale: "en", reminders: { smsEnabled: false }, secrets: { x: 1 } });
    await setBirthdayHeaderIcon(ctx(role), true);
    expect(writes).toEqual([
      {
        settings: {
          locale: "en",
          reminders: { smsEnabled: false },
          secrets: { x: 1 },
          birthdayIndication: { headerIcon: true },
        },
      },
    ]);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.anything(),
      ctx(role),
      expect.objectContaining({ action: "tenant.update", metadata: { fields: ["birthdayIndication"] } }),
    );
  });

  it("switches it back OFF", async () => {
    const writes = fakeTx({ birthdayIndication: { headerIcon: true } });
    await setBirthdayHeaderIcon(ctx("admin"), false);
    expect(writes).toEqual([{ settings: { birthdayIndication: { headerIcon: false } } }]);
  });

  it("refuses anything but a boolean", async () => {
    fakeTx({});
    await expect(setBirthdayHeaderIcon(ctx("admin"), "true" as unknown as boolean)).rejects.toThrow();
    expect(mockRunScoped).not.toHaveBeenCalled();
  });
});
