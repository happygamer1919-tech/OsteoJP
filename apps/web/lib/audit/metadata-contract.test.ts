import { vi, describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * ALL FOUR AUDIT HELPERS ENFORCE THE CONTRACT, AND THE FIFTH ONE CANNOT SHIP
 * WITHOUT DOING SO EITHER.
 *
 * ==========================================================================
 * WHY THIS SUITE EXISTS, AND IT IS THE SECOND TIME
 * ==========================================================================
 * #1226 found that `cancelAppointment` had written a free-text reason into
 * `audit_log` for months, sourced from the agenda drawer's `form.notes` - an
 * existing clinical note about a named patient, into a table that is append-only
 * and retained for ever. The helper's doc comment had forbidden exactly that
 * since the day it was written.
 *
 * THAT FIX GUARDED ONE HELPER OF FOUR. The other three carried the identical
 * promise in a comment and enforced nothing, and `lib/admin/audit.ts` is the one
 * a pacote switch will call - PACK-06 rules that reception types an amount AND A
 * REASON, prose typed at a front desk about one patient's money.
 *
 * So the interesting assertion is not "the guard works". It is "every helper
 * calls it", and, one step further out, "a helper that does not call it cannot
 * be added quietly". The source arm at the bottom is that second claim, and it
 * is the half that survives somebody writing a fifth writer next month.
 */

vi.mock("server-only", () => ({}));

import { assertPiiFreeAuditMetadata, AuditMetadataError } from "./metadata-contract";
import { writeAudit as writeAdminAudit } from "../admin/audit";
import { writeAudit as writePatientAudit } from "../patients/audit";
import { writeClinicalAudit } from "../clinical/audit";
import { writeAppointmentAudit } from "../scheduling/audit";

/** The string the old code put in the log. Prose, about a patient, in pt-PT. */
const CLINICAL_NOTE = "Dores lombares desde segunda, pediu para remarcar para a proxima semana";
/** What reception will type on a pacote switch once PACK-06 is built. */
const PACOTE_REASON = "Passou do pacote de 5 para o de 10, pagou a diferenca em dinheiro";

const ACTOR = { tenantId: "tenant-A", role: "reception", userId: "user-1" } as never;
const UUID = "0f8f6a9e-6f31-4e0a-9a5c-2d1c3b4a5e6f";

let inserted: Array<Record<string, unknown>>;
function fakeTx() {
  return {
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        inserted.push(v);
        return [];
      },
    }),
  } as never;
}

beforeEach(() => {
  inserted = [];
});

/**
 * The four helpers, each with a call that must be REFUSED and one that must be
 * ACCEPTED.
 *
 * BOTH ARMS ARE REQUIRED. A suite with only refusals passes just as well over a
 * guard that rejects everything, which would take the audit trail out entirely -
 * a worse outcome than the defect, and one that no refusal test can see.
 */
const HELPERS = [
  {
    name: "admin/writeAudit",
    prose: () =>
      writeAdminAudit(fakeTx(), ACTOR, {
        action: "pack.switch",
        entityType: "pack_instance",
        entityId: UUID,
        metadata: { switchReason: PACOTE_REASON, amountCents: 1500 },
      }),
    clean: () =>
      writeAdminAudit(fakeTx(), ACTOR, {
        action: "pack.switch",
        entityType: "pack_instance",
        entityId: UUID,
        metadata: { hadReason: true, amountCents: 1500, fromPackId: UUID },
      }),
  },
  {
    name: "patients/writeAudit",
    prose: () =>
      writePatientAudit(fakeTx(), ACTOR, {
        action: "patient.update",
        entityId: UUID,
        metadata: { note: CLINICAL_NOTE },
      }),
    clean: () =>
      writePatientAudit(fakeTx(), ACTOR, {
        action: "patient.update",
        entityId: UUID,
        metadata: { fields: ["phone", "postal_code"], wasSoftDeleted: false },
      }),
  },
  {
    name: "clinical/writeClinicalAudit",
    prose: () =>
      writeClinicalAudit(fakeTx(), {
        tenantId: "tenant-A",
        actorUserId: "user-1",
        action: "clinical_record.annul",
        entityType: "clinical_record",
        entityId: UUID,
        metadata: { reason: CLINICAL_NOTE },
        ip: null,
      }),
    clean: () =>
      writeClinicalAudit(fakeTx(), {
        tenantId: "tenant-A",
        actorUserId: "user-1",
        action: "clinical_record.annul",
        entityType: "clinical_record",
        entityId: UUID,
        metadata: { hadReason: true },
        ip: null,
      }),
  },
  {
    name: "scheduling/writeAppointmentAudit",
    prose: () =>
      writeAppointmentAudit(fakeTx(), {
        tenantId: "tenant-A",
        actorUserId: "user-1",
        action: "appointment.cancel",
        appointmentId: UUID,
        metadata: { reason: CLINICAL_NOTE },
        ip: null,
      }),
    clean: () =>
      writeAppointmentAudit(fakeTx(), {
        tenantId: "tenant-A",
        actorUserId: "user-1",
        action: "appointment.cancel",
        appointmentId: UUID,
        metadata: { hadReason: true, scope: "one", toStatus: "cancelled" },
        ip: null,
      }),
  },
] as const;

describe("every audit helper REFUSES free text", () => {
  for (const h of HELPERS) {
    it(`${h.name} refuses prose, and writes NOTHING when it does`, async () => {
      await expect(h.prose()).rejects.toThrow(AuditMetadataError);
      // THE ROW COUNT IS THE ASSERTION THAT MATTERS. A guard that threw AFTER
      // the insert would satisfy `rejects.toThrow` and still have written the
      // clinical note into an append-only table.
      expect(inserted, `${h.name} inserted a row despite refusing`).toHaveLength(0);
    });
  }
});

describe("every audit helper still ACCEPTS a legitimate row", () => {
  for (const h of HELPERS) {
    it(`${h.name} writes ids, enums, counts and booleans as before`, async () => {
      await expect(h.clean()).resolves.toBeUndefined();
      expect(inserted).toHaveLength(1);
      expect(inserted[0]!.metadata).toBeDefined();
    });
  }
});

describe("the refusal names the writer, and never the value", () => {
  for (const h of HELPERS) {
    it(`${h.name} says which helper broke the contract`, async () => {
      const err = await h.prose().catch((e: Error) => e);
      const msg = (err as Error).message;
      // Four helpers share one function, so the stack alone does not say which
      // contract was broken.
      expect(msg).toContain(h.name);
      // And the message travels to logs and Sentry.
      expect(msg).not.toContain(CLINICAL_NOTE);
      expect(msg).not.toContain(PACOTE_REASON);
      expect(msg).not.toContain("Dores");
      expect(msg).not.toContain("pacote de 5");
    });
  }
});

// ====================================================================
// THE SOURCE ARM. The behavioural arms above cover the four writers that exist
// today. This one covers the fifth, written next month.
// ====================================================================
describe("no module writes audit_log without either the guard or a named exception", () => {
  const WEB = join(__dirname, "..", "..");

  /**
   * Modules that INSERT into audit_log directly, bypassing every helper, with
   * the reason each is allowed to.
   *
   * SIX OF THE SEVEN WRITE ONLY IDS, ENUMS, COUNTS AND HASHES. THE SEVENTH IS
   * THE REASON THE GUARD LIVES IN THE HELPERS AND NOT AT THE TABLE:
   * `messaging-check.ts` writes the PROVIDER'S OWN ERROR TEXT, trimmed to 300
   * characters, because Twilio's wording is the whole diagnostic value of that
   * page. It is free text and it is NOT patient PII, and those are different
   * things. A table-level guard would refuse it and break the owner's messaging
   * diagnostic.
   */
  const DIRECT_WRITERS = new Map([
    ["lib/reminders/messaging-check.ts", "DELIBERATE: metadata.failure is the provider's own error text"],
    ["lib/reminders/inbound-store.ts", "ids, enums and booleans only"],
    ["lib/reminders/confirm-redeem.ts", "a single slug, via: 'confirm_code'"],
    ["lib/reminders/inbound-reply.ts", "bounded ReviewReason enum, ids and outcome slugs"],
    ["lib/integrations/ifthenpay/ledger-drizzle.ts", "provider and method slugs"],
  ]);

  function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(e) && !/\.test\./.test(e)) out.push(full);
    }
    return out;
  }

  const writers = walk(join(WEB, "lib"))
    .filter((f) => /insert\(auditLog\)/.test(readFileSync(f, "utf8")))
    .map((f) => f.slice(WEB.length + 1));

  it("found the audit writers at all", () => {
    // Vacuous-pass guard: a broken walk or a renamed table would make the
    // assertion below pass over an empty list.
    expect(writers.length).toBeGreaterThanOrEqual(8);
  });

  it("every writer either calls the guard or is a named exception", () => {
    const unguarded = writers.filter((rel) => {
      if (DIRECT_WRITERS.has(rel)) return false;
      return !/assertPiiFreeAuditMetadata\(/.test(readFileSync(join(WEB, rel), "utf8"));
    });
    expect(unguarded, unguarded.join(", ")).toEqual([]);
  });

  it("every named exception still exists and still writes audit_log", () => {
    // AN EXCEPTION NOBODY CAN SEE IS A HOLE. If one of these is deleted, or
    // stops writing audit_log, or grows a guard of its own, its entry must go -
    // otherwise the list quietly starts excusing nothing while looking thorough.
    for (const [rel, why] of DIRECT_WRITERS) {
      const src = readFileSync(join(WEB, rel), "utf8");
      expect(/insert\(auditLog\)/.test(src), `${rel} no longer writes audit_log`).toBe(true);
      expect(why.length).toBeGreaterThan(20);
    }
  });

  it("the documented exception is REAL: messaging-check still writes the provider's text", () => {
    // The one entry that is not "ids only" must keep earning its place. If this
    // stops being true, the guard belongs at the table and the exception list
    // can go.
    const src = readFileSync(join(WEB, "lib/reminders/messaging-check.ts"), "utf8");
    expect(src).toMatch(/failure = err instanceof Error \? err\.message\.slice\(0, 300\)/);
    expect(src).toMatch(/failure: failure \?\? null/);
  });

  it("the contract file names every exception, so the two lists cannot drift", () => {
    const doc = readFileSync(join(__dirname, "metadata-contract.ts"), "utf8");
    for (const rel of DIRECT_WRITERS.keys()) {
      const base = rel.split("/").slice(-2).join("/");
      expect(doc, `metadata-contract.ts does not mention ${base}`).toContain(base);
    }
  });
});

describe("the guard itself, on the shapes the helpers actually write", () => {
  it("accepts uuids, ISO instants, enums, counts, booleans, nulls and name arrays", () => {
    expect(() =>
      assertPiiFreeAuditMetadata(
        {
          patientId: UUID,
          startsAt: "2026-09-01T09:00:00.000Z",
          status: "scheduled",
          changed: ["notes", "status"],
          count: 12,
          allowConflict: false,
          packId: null,
          ref: { entityType: "appointment", entityId: UUID },
        },
        "test",
      ),
    ).not.toThrow();
  });

  it("refuses a two-word value, because a patient name is the PII named first", () => {
    expect(() => assertPiiFreeAuditMetadata({ who: "Maria Silva" }, "test")).toThrow(
      AuditMetadataError,
    );
  });
});
