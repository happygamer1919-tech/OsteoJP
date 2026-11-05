import { vi, describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W13-04 step 7, carried into the Tipos de Marcacao table (2026-11-02).
 * `patient_bookable` (the AGENDA tag) and `is_active` (the switch) are written
 * by ONE function now, `saveServiceTypesTable`, which replaced the two old
 * per-row buttons (`setServicePatientBookable`, `setServiceActive`, deleted).
 *
 * WHAT MAKES THIS WORTH A TEST. Migration 0057 added the column and backfilled
 * it; JP then ruled the real set and it was applied to production BY HAND.
 * The risk that comes with a screen is the mis-click, so the assertions below
 * are about scope: each control writes ONE column, it is a capability-gated
 * write, it is audited distinctly from an ordinary edit, the PACK-04 archive
 * guard still refuses before anything is written, and a page drawn before
 * somebody else's save cannot write over it.
 *
 * The database is faked: `select` answers from a queue (first the rows the
 * save locks, then the pacotes bound to any row being switched off), and every
 * `update(...).set(v)` records `v`. The real behaviour against Postgres is
 * service-types-table.db.test.ts.
 */

vi.mock("server-only", () => ({}));

type Current = {
  id: string;
  name: string;
  priceCents: number | null;
  durationMin: number;
  followUpDays: number | null;
  vatRate: number | null;
  vatExemptionCode: string | null;
  smsReminders: boolean;
  color: string | null;
  isActive: boolean;
  patientBookable: boolean;
  updatedAt: Date;
};

const H = vi.hoisted(() => ({
  sets: [] as Record<string, unknown>[],
  audits: [] as Record<string, unknown>[],
  selects: [] as unknown[][],
  locks: [] as string[],
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
      select: () => ({
        from: () => ({
          where: () => {
            const result = H.selects.shift() ?? [];
            return Object.assign(Promise.resolve(result), {
              for: async (mode: string) => {
                H.locks.push(mode);
                return result;
              },
            });
          },
        }),
      }),
      update: () => ({
        set: (v: Record<string, unknown>) => {
          H.sets.push(v);
          return { where: async () => undefined };
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

import { saveServiceTypesTable } from "./services";
import type { ServiceTypeRow } from "./service-types-form";

const actor = { tenantId: "tenant-A", role: "admin", userId: "user-1" } as never;
const SEEN = 1_793_600_000_000;

const current = (over: Partial<Current> = {}): Current => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Fisioterapia",
  priceCents: 5000,
  durationMin: 45,
  followUpDays: null,
  vatRate: null,
  vatExemptionCode: null,
  smsReminders: true,
  color: null,
  isActive: true,
  patientBookable: false,
  updatedAt: new Date(SEEN),
  ...over,
});

/** The row as the page posts it back untouched. */
const posted = (c: Current, over: Partial<ServiceTypeRow> = {}): ServiceTypeRow => ({
  id: c.id,
  name: c.name,
  priceCents: c.priceCents,
  vatRate: c.vatRate as 0 | null,
  vatExemptionCode: c.vatExemptionCode as "M07" | null,
  isActive: c.isActive,
  color: c.color,
  smsReminders: c.smsReminders,
  patientBookable: c.patientBookable,
  durationMin: c.durationMin,
  seenUpdatedAtMs: c.updatedAt.getTime(),
  ...over,
});

beforeEach(() => {
  H.sets = [];
  H.audits = [];
  H.selects = [];
  H.locks = [];
  H.capabilities = [];
});

describe("the AGENDA tag writes exactly one column", () => {
  it("opens a type to patient booking", async () => {
    const c = current();
    H.selects = [[c]];
    await saveServiceTypesTable(actor, [posted(c, { patientBookable: true })]);
    expect(H.sets).toEqual([{ patientBookable: true }]);
  });

  it("closes it again", async () => {
    const c = current({ patientBookable: true });
    H.selects = [[c]];
    await saveServiceTypesTable(actor, [posted(c, { patientBookable: false })]);
    expect(H.sets).toEqual([{ patientBookable: false }]);
  });

  it("never touches isActive or internalOnly", async () => {
    // The three are INDEPENDENT gates. A control that also flipped isActive
    // would remove the type from the staff agenda as a side effect of a portal
    // decision; one that flipped internalOnly would undo an exposure control
    // from a screen that is not about exposure.
    const c = current();
    H.selects = [[c]];
    await saveServiceTypesTable(actor, [posted(c, { patientBookable: true })]);
    for (const set of H.sets) {
      expect(Object.keys(set)).toEqual(["patientBookable"]);
    }
  });
});

describe("the switch writes exactly one column, and PACK-04 still guards it", () => {
  it("switching OFF a type no pacote uses writes isActive only and audits service.archive", async () => {
    const c = current();
    H.selects = [[c], []];
    await saveServiceTypesTable(actor, [posted(c, { isActive: false })]);
    expect(H.sets).toEqual([{ isActive: false }]);
    expect(H.audits).toEqual([{ action: "service.archive", entityType: "service", entityId: c.id }]);
  });

  it("switching it back ON is never guarded and audits service.restore", async () => {
    const c = current({ isActive: false });
    H.selects = [[c]];
    await saveServiceTypesTable(actor, [posted(c, { isActive: true })]);
    expect(H.sets).toEqual([{ isActive: true }]);
    expect(H.audits).toEqual([{ action: "service.restore", entityType: "service", entityId: c.id }]);
  });

  it("switching OFF a type a pacote uses is refused, naming the pacote, before ANY write", async () => {
    const c = current();
    const other = current({ id: "22222222-2222-4222-8222-222222222222", name: "Reavaliação" });
    H.selects = [[c, other], [{ id: "p1", name: "Nesa pack 10", baseServiceId: c.id }]];
    await expect(
      saveServiceTypesTable(actor, [posted(other, { name: "Mudou" }), posted(c, { isActive: false })]),
    ).rejects.toMatchObject({ code: "has_packs", message: "Nesa pack 10" });
    expect(H.sets).toEqual([]);
    expect(H.audits).toEqual([]);
  });
});

describe("it is gated, audited, and never writes over somebody else's save", () => {
  it("asserts the services:write capability", async () => {
    const c = current();
    H.selects = [[c]];
    await saveServiceTypesTable(actor, [posted(c)]);
    expect(H.capabilities).toEqual(["services:write"]);
  });

  it("audits the AGENDA tag with an action that names the DIRECTION", async () => {
    // "who opened this to patients, and when" must be answerable from the trail
    // without diffing rows.
    const c = current();
    H.selects = [[c]];
    await saveServiceTypesTable(actor, [posted(c, { patientBookable: true })]);
    expect(H.audits).toEqual([{ action: "service.patient_bookable_on", entityType: "service", entityId: c.id }]);

    H.audits = [];
    const on = current({ patientBookable: true });
    H.selects = [[on]];
    await saveServiceTypesTable(actor, [posted(on, { patientBookable: false })]);
    expect(H.audits).toEqual([{ action: "service.patient_bookable_off", entityType: "service", entityId: c.id }]);
  });

  it("reads the rows it may write FOR UPDATE, so two saves of the same rows queue", async () => {
    const c = current();
    H.selects = [[c]];
    await saveServiceTypesTable(actor, [posted(c)]);
    expect(H.locks).toEqual(["update"]);
  });

  it("an untouched row writes nothing and audits nothing", async () => {
    const c = current();
    H.selects = [[c]];
    await saveServiceTypesTable(actor, [posted(c)]);
    expect(H.sets).toEqual([]);
    expect(H.audits).toEqual([]);
  });

  it("a row changed since the page was drawn refuses the WHOLE save (stale), before any write", async () => {
    const c = current();
    const moved = current({ id: "22222222-2222-4222-8222-222222222222", updatedAt: new Date(SEEN + 1) });
    H.selects = [[c, moved]];
    await expect(
      saveServiceTypesTable(actor, [
        posted(c, { name: "Mudou" }),
        { ...posted(moved), seenUpdatedAtMs: SEEN, patientBookable: true },
      ]),
    ).rejects.toMatchObject({ code: "stale" });
    expect(H.sets).toEqual([]);
    expect(H.audits).toEqual([]);
  });

  it("refuses an unknown row instead of silently doing nothing", async () => {
    H.selects = [[]];
    await expect(saveServiceTypesTable(actor, [posted(current(), { name: "Mudou" })])).rejects.toMatchObject({
      code: "not_found",
    });
    expect(H.audits).toEqual([]);
  });
});

describe("strategy's answers of 2026-11-04 hold on the server", () => {
  it("Q9: a save never writes follow_up_days, so a stored value stays", async () => {
    const c = current({ followUpDays: 2 });
    H.selects = [[c]];
    await saveServiceTypesTable(actor, [posted(c, { name: "Mudou", priceCents: 6000 })]);
    expect(H.sets).toHaveLength(1);
    expect(H.sets[0]).not.toHaveProperty("followUpDays");
    expect(H.audits).toEqual([
      { action: "service.update", entityType: "service", entityId: c.id, metadata: { fields: ["name", "priceCents"] } },
    ]);
  });

  it("Q5: IVA 0% with no Motivo is refused before the database, whatever the caller", async () => {
    const c = current();
    H.selects = [[c]];
    await expect(
      saveServiceTypesTable(actor, [posted(c, { vatRate: 0, vatExemptionCode: null })]),
    ).rejects.toMatchObject({ field: "vatReasonRequired" });
    expect(H.locks).toEqual([]);
    expect(H.sets).toEqual([]);
    expect(H.audits).toEqual([]);
  });

  it("Q5: IVA 0% with a Motivo saves", async () => {
    const c = current();
    H.selects = [[c]];
    await saveServiceTypesTable(actor, [posted(c, { vatRate: 0, vatExemptionCode: "M07" })]);
    expect(H.sets).toEqual([expect.objectContaining({ vatRate: 0, vatExemptionCode: "M07" })]);
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
  // The switch and the AGENDA tag live in the one table Fisiozero saves with
  // one button, so they are no longer two forms. What this pins is that they
  // are two INDEPENDENT inputs, and that the PACK-04 lock survives the post.
  const table = readFileSync(
    join(__dirname, "..", "..", "app", "admin", "services", "ServiceTypesTable.tsx"),
    "utf-8",
  );

  it("renders the AGENDA tag and the active switch as two inputs of their own", () => {
    expect(table).toContain("name={`agenda__${svc.id}`}");
    expect(table).toContain("name={`active__${svc.id}`}");
  });

  it("a locked switch posts 'on' through a hidden input, because a disabled checkbox posts nothing", () => {
    // Without the hidden input a locked (PACK-04) row would post no active__
    // value, read as switched OFF, and every save of the table would be refused
    // by the server's own PACK-04 guard.
    expect(table).toMatch(
      /\{switchLocked && \(\s*<input type="hidden" name=\{`active__\$\{svc\.id\}`\} value="on" form=\{TABLE_FORM_ID\} \/>\s*\)\}/,
    );
    expect(table).toContain("disabled={switchLocked}");
    expect(table).toContain("const switchLocked = svc.isActive && archiveBlocking.length > 0;");
  });

  it("labels the AGENDA and SMS tags in pt-PT", () => {
    const strings = JSON.parse(
      readFileSync(
        join(__dirname, "..", "..", "..", "..", "packages/i18n/src/strings.pt.json"),
        "utf-8",
      ),
    ) as Record<string, string>;
    expect(strings["admin.serviceTypes.agenda"]).toBe("AGENDA");
    expect(strings["admin.serviceTypes.agendaHelp"]).toBe("Marcação online pelo paciente");
    expect(strings["admin.serviceTypes.sms"]).toBe("SMS");
  });
});
