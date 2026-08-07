import { vi, describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W13-04 step 7 — `patient_bookable` becomes staff-maintainable, the way
 * `is_bookable` is for therapists (0046, the Equipa checkbox).
 *
 * WHAT MAKES THIS WORTH A TEST. Migration 0057 added the column and backfilled
 * it; JP then ruled the real set and it was applied to production BY HAND.
 * Without a screen, every future change is another hand-run statement against
 * production. The risk that comes with the screen is the mis-click, so the
 * assertions below are about scope: the toggle writes ONE column, it is a
 * capability-gated write, it is audited distinctly from an ordinary edit, and
 * it is not folded into the archive control.
 */

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({
  sets: [] as Record<string, unknown>[],
  audits: [] as Record<string, unknown>[],
  returning: [{ id: "svc-1" }] as { id: string }[],
  capabilities: [] as string[],
}));

vi.mock("@osteojp/auth", () => ({
  assertCan: (_role: string, cap: string) => {
    H.capabilities.push(cap);
  },
  ForbiddenError: class ForbiddenError extends Error {},
}));

vi.mock("@/lib/auth/context", () => ({
  runScoped: vi.fn(async (_ctx: unknown, cb: (tx: unknown) => unknown) =>
    cb({
      update: () => ({
        set: (v: Record<string, unknown>) => {
          H.sets.push(v);
          return { where: () => ({ returning: async () => H.returning }) };
        },
      }),
    }),
  ),
}));

vi.mock("./audit", () => ({
  writeAudit: vi.fn(async (_tx: unknown, _actor: unknown, entry: Record<string, unknown>) => {
    H.audits.push(entry);
  }),
}));

import { setServicePatientBookable } from "./services";
import { AdminError } from "./errors";

const actor = { tenantId: "tenant-A", role: "admin", userId: "user-1" } as never;

beforeEach(() => {
  H.sets = [];
  H.audits = [];
  H.capabilities = [];
  H.returning = [{ id: "svc-1" }];
});

describe("the toggle writes exactly one column", () => {
  it("opens a service to patient booking", async () => {
    await setServicePatientBookable(actor, "svc-1", true);

    expect(H.sets).toHaveLength(1);
    expect(H.sets[0]).toEqual({ patientBookable: true });
  });

  it("closes it again", async () => {
    await setServicePatientBookable(actor, "svc-1", false);

    expect(H.sets[0]).toEqual({ patientBookable: false });
  });

  it("never touches isActive or internalOnly", async () => {
    // The three are INDEPENDENT gates. A control that also flipped isActive
    // would remove the service from the staff agenda as a side effect of a
    // portal decision; one that flipped internalOnly would undo an exposure
    // control from a screen that is not about exposure.
    await setServicePatientBookable(actor, "svc-1", true);

    for (const set of H.sets) {
      expect(Object.keys(set)).toEqual(["patientBookable"]);
      expect(set).not.toHaveProperty("isActive");
      expect(set).not.toHaveProperty("internalOnly");
    }
  });
});

describe("it is gated and audited like every other service mutation", () => {
  it("asserts the services:write capability", async () => {
    await setServicePatientBookable(actor, "svc-1", true);
    expect(H.capabilities).toContain("services:write");
  });

  it("audits with an action that names the DIRECTION", async () => {
    // "who opened this to patients, and when" must be answerable from the trail
    // without diffing rows, so on and off are distinct actions rather than one
    // service.update carrying a payload.
    await setServicePatientBookable(actor, "svc-1", true);
    expect(H.audits[0]).toMatchObject({
      action: "service.patient_bookable_on",
      entityType: "service",
      entityId: "svc-1",
    });

    H.audits = [];
    await setServicePatientBookable(actor, "svc-1", false);
    expect(H.audits[0]).toMatchObject({ action: "service.patient_bookable_off" });
  });

  it("refuses an unknown service instead of silently doing nothing", async () => {
    H.returning = [];
    await expect(setServicePatientBookable(actor, "nope", true)).rejects.toBeInstanceOf(AdminError);
    expect(H.audits).toHaveLength(0);
  });
});

describe("the mis-click cannot expose an internal service", () => {
  it("the portal's own predicate still requires all three clauses", () => {
    // This screen can set patient_bookable on a row that is ALSO internal_only.
    // That combination is reachable and is exactly what a mis-click produces, so
    // the refusal lives where the booking happens, not in the admin UI.
    const predicate = readFileSync(
      join(__dirname, "..", "..", "..", "..", "apps/api/lib/appointments/services.ts"),
      "utf-8",
    );
    expect(predicate).toContain("isServiceBookableByPatient");
    expect(predicate).toMatch(/internalOnly/);
    expect(predicate).toMatch(/patientBookable/);
    expect(predicate).toMatch(/isActive/);
  });
});

describe("the surface keeps the two decisions separate", () => {
  const page = readFileSync(
    join(__dirname, "..", "..", "app", "admin", "services", "page.tsx"),
    "utf-8",
  );

  it("renders its own form, not a field inside the archive form", () => {
    expect(page).toContain("setServicePatientBookableAction");
    expect(page).toContain("setServiceActiveAction");
    // Two distinct forms: archiving must not be the only way off the portal.
    const bookableIdx = page.indexOf("action={setServicePatientBookableAction}");
    const activeIdx = page.indexOf("action={setServiceActiveAction}");
    expect(bookableIdx).toBeGreaterThan(-1);
    expect(activeIdx).toBeGreaterThan(bookableIdx);
  });

  it("labels both states in pt-PT", () => {
    const strings = JSON.parse(
      readFileSync(
        join(__dirname, "..", "..", "..", "..", "packages/i18n/src/strings.pt.json"),
        "utf-8",
      ),
    ) as Record<string, string>;
    expect(strings["admin.services.patientBookableOn"]).toBe("Abrir a marcação por pacientes");
    expect(strings["admin.services.patientBookableOff"]).toBe("Fechar a marcação por pacientes");
    expect(strings["admin.services.patientBookableBadge"]).toBeTruthy();
  });
});
