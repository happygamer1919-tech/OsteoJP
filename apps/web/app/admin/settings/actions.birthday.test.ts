import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: async () => ({ tenantId: "t-1", role: "admin", userId: "u-1" }),
}));
vi.mock("@/lib/admin/settings", () => ({
  setBirthdayHeaderIcon: vi.fn(async () => {}),
  updateTenantSettings: vi.fn(),
}));
vi.mock("@/lib/admin/appointment-delete-password", () => ({ setDeletePassword: vi.fn() }));

import { setBirthdayHeaderIcon } from "@/lib/admin/settings";
import { saveBirthdayIndicationAction } from "./actions";

/**
 * Indicação de Aniversários: the switch's server action. The form posts the
 * value it wants, "true" or "false"; anything else is refused WITHOUT a write.
 */

const mockSet = vi.mocked(setBirthdayHeaderIcon);

const post = (value: string | null) => {
  const fd = new FormData();
  if (value !== null) fd.set("birthdayHeaderIcon", value);
  return saveBirthdayIndicationAction(fd);
};

beforeEach(() => {
  mockSet.mockClear();
});

describe("saveBirthdayIndicationAction", () => {
  it.each([
    ["true", true],
    ["false", false],
  ] as const)("posts %s: saves %s and reports ok", async (value, saved) => {
    await expect(post(value)).rejects.toThrow("REDIRECT /admin/settings?m=ok");
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet.mock.calls[0]![1]).toBe(saved);
  });

  it.each([["on"], ["TRUE"], ["1"], [""], [null]])(
    "refuses %s without a write",
    async (value) => {
      await expect(post(value)).rejects.toThrow("REDIRECT /admin/settings?m=err:invalid");
      expect(mockSet).not.toHaveBeenCalled();
    },
  );
});
