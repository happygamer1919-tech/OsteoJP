/**
 * sweep-r24-no-grace.test.ts: strategy's ruling R24, without a database.
 *
 *   "S5 grace = none. GATE: a visit saved after its mark and before the pass
 *   gets no shadow row and no send; a visit saved before its mark is
 *   unchanged."
 *
 * What is held here is the SQL both passes send, rendered by the query
 * builder itself, read off every query of a selection with a stand-in
 * transaction that records them and answers nothing:
 *
 *   1. THE GATE: a re-arming save (R33: the table of
 *      ./reminder-population.ts, held to the source by
 *      re-arming-saves.test.ts) whose `created_at` is STRICTLY AFTER the mark
 *      of the offset being selected. At the mark is before it.
 *   2. THE SHADOW PASS asks it, for both offsets, in the count of what is due
 *      and in the read of the marks it takes.
 *   3. THE SENDING PASS asks it the same way, and lifts it only for a save
 *      written after a claim of this mark was taken (at or before the save),
 *      and only while the mark is at most 3 hours before the pass (R34).
 *
 * That the gate does what it says on rows (saved after, before, at the mark;
 * both passes; the retry) is proven in sweep.db.test.ts and
 * sweep-send.db.test.ts.
 */
import { sql as rawSql } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { REMINDER_OFFSETS } = await import("./offsets");
const { hasReArmingSaveAfter, hasSchedulingEvent } = await import("./reminder-population");
const { notSavedAfterMark, selectDueMarks } = await import("./sweep");
const { SWEEP_RETRY_AFTER_SAVE_LIMIT_MS, selectSendableMarks } = await import("./sweep-send");
type DbTx = import("@osteojp/db").DbTx;
type SQL = import("drizzle-orm").SQL;

const qb = new QueryBuilder();
const NOW = new Date("2027-02-10T10:15:00.000Z");
const TENANT = "aaaaaaaa-0000-4000-8000-000000000001";

/** The SQL text of a condition, as it reads inside `select 1 from appointments where <it>`. */
async function textOf(condition: SQL): Promise<{ sql: string; params: unknown[] }> {
  const { appointments } = await import("@osteojp/db");
  return qb.select({ one: appointments.id }).from(appointments).where(condition).toSQL();
}

/**
 * A transaction that renders every query it is asked to run, answers each
 * with no rows (or the count 0, or a floor far in the past), and runs
 * nothing. Its `select` is the query builder's own, so a subquery inside a
 * condition renders exactly as it would on a real connection.
 */
function recordingTx() {
  const queries: string[] = [];
  const full: { sql: string; params: unknown[] }[] = [];
  const tx = {
    select(fields: Record<string, unknown>) {
      const builder = qb.select(fields as never);
      return {
        from(table: never) {
          const query = builder.from(table) as unknown as Record<string, unknown> & {
            toSQL: () => { sql: string; params: unknown[] };
          };
          query.then = (resolve: (rows: unknown[]) => unknown) => {
            queries.push(query.toSQL().sql);
            full.push(query.toSQL());
            if ("n" in fields) return resolve([{ n: 0 }]);
            if ("first" in fields) return resolve([{ first: new Date("2026-01-05T08:00:00Z") }]);
            return resolve([]);
          };
          return query;
        },
      };
    },
  };
  return { tx: tx as unknown as DbTx, queries, full };
}

/** The R24 clause, as rendered: a re-arming save written after the mark of an offset. */
const AFTER_THE_MARK =
  /"reminder_re_arming_save"\."created_at" > "appointments"\."starts_at" - make_interval\(mins => \$(\d+)::int\)/g;

describe("R24: the gate, as SQL", () => {
  it("is a re-arming save written STRICTLY after the mark: `>`, never `>=`, against the start less the offset", async () => {
    for (const offset of REMINDER_OFFSETS) {
      const { sql, params } = await textOf(notSavedAfterMark(qb as unknown as DbTx, offset));
      const found = [...sql.matchAll(AFTER_THE_MARK)];
      expect(found, offset.id).toHaveLength(1);
      // The parameter in the mark is this offset's minutes.
      expect(params[Number(found[0]![1]) - 1], offset.id).toBe(offset.minutesBefore);
      // It is a gate: the visit is taken only when NO such save exists.
      expect(sql).toMatch(/where not exists \(select 1 from "audit_log" "reminder_re_arming_save"/);
      expect(sql).not.toMatch(/"reminder_re_arming_save"\."created_at" >= /);
    }
  });

  it("R33: reads the re-arming saves, NOT the wider scheduling events the population reads", async () => {
    const population = (await textOf(hasSchedulingEvent(qb as unknown as DbTx))).sql;
    const gate = (await textOf(hasReArmingSaveAfter(qb as unknown as DbTx, rawSql`now()`))).sql;
    // The population counts any update to Agendada or Confirmada and any SMS "confirmo".
    expect(population).toContain(`->>'toStatus' in ('scheduled', 'confirmed')`);
    expect(population).not.toContain(`"appointments"."origin"`);
    // The gate does not: a status counts only with the status it came from, and
    // an acceptance only on a visit that is an online request.
    expect(gate).not.toContain(`->>'toStatus' in`);
    expect(gate).toContain(`->>'fromStatus' = 'scheduled'`);
    expect(gate).toContain(`->>'fromStatus' = 'cancelled'`);
    expect(gate).toContain(`"appointments"."origin" = $`);
  });
});

describe("R24: both passes ask it", () => {
  it("the SHADOW pass asks it for both offsets, in the count of what is due and in the read of the marks", async () => {
    const { tx, queries } = recordingTx();
    await selectDueMarks(tx, { tenantId: TENANT, now: NOW, limit: 50 });
    // Per offset: the due count, the never-reminded count, the marks.
    expect(queries).toHaveLength(REMINDER_OFFSETS.length * 3);
    const gated = queries.filter((q) => q.match(AFTER_THE_MARK)?.length === 1);
    expect(gated).toHaveLength(REMINDER_OFFSETS.length * 2);
    expect(gated.filter((q) => q.startsWith("select count(*)"))).toHaveLength(REMINDER_OFFSETS.length);
    // The shadow lifts it for nothing.
    for (const q of gated) expect(q).not.toContain("reminder_send_claim_before_the_save");
  });

  it("the SENDING pass asks it the same way, and lifts it only for a save written at or after a claim of this mark", async () => {
    const { tx, queries } = recordingTx();
    await selectSendableMarks(tx, { tenantId: TENANT, now: NOW, limit: 50, includeNeverReminded: false });
    const gated = queries.filter((q) => q.match(AFTER_THE_MARK)?.length === 1);
    // Per offset: the due count, and the two reads of the marks (in time, too late).
    expect(gated).toHaveLength(REMINDER_OFFSETS.length * 3);
    for (const q of gated) {
      expect(q).toContain(
        `and not ("appointments"."starts_at" >= $`,
      );
      expect(q).toMatch(
        /"appointments"\."starts_at" >= \$\d+ and exists \(select 1 from "reminder_claims" "reminder_send_claim_before_the_save" where \(/,
      );
      expect(q).toMatch(
        /"reminder_send_claim_before_the_save"\."created_at" <= "reminder_re_arming_save"\."created_at"/,
      );
      // A claim of THIS mark: the kind, not early, and the start as a claim stores it.
      expect(q).toContain(`"reminder_send_claim_before_the_save"."early" is distinct from true`);
      expect(q).toContain(
        `"reminder_send_claim_before_the_save"."starts_at" = date_trunc('milliseconds', "appointments"."starts_at")`,
      );
    }
  });

  it("R34: the retry after a save is lifted only while the mark is at most 3 hours before the pass, `>=` on the start", async () => {
    expect(SWEEP_RETRY_AFTER_SAVE_LIMIT_MS).toBe(3 * 60 * 60_000);
    const { tx, full: seen } = recordingTx();
    await selectSendableMarks(tx, { tenantId: TENANT, now: NOW, limit: 50, includeNeverReminded: false });
    const CAP = /and not \("appointments"\."starts_at" >= \$(\d+) and exists \(select 1 from "reminder_claims" "reminder_send_claim_before_the_save"/;
    const gated = seen.filter((q) => q.sql.match(AFTER_THE_MARK)?.length === 1);
    expect(gated).toHaveLength(REMINDER_OFFSETS.length * 3);
    for (const q of gated) {
      const cap = CAP.exec(q.sql);
      expect(cap, q.sql).not.toBeNull();
      // The offset this query selects, read off the mark of the R24 clause.
      const minutes = Number(q.params[Number([...q.sql.matchAll(AFTER_THE_MARK)][0]![1]) - 1]);
      expect(REMINDER_OFFSETS.map((o) => o.minutesBefore)).toContain(minutes);
      // On the start: the pass, less 3 hours, plus the offset. So the mark is at or after the pass less 3 hours.
      expect(q.params[Number(cap![1]) - 1]).toBe(new Date(NOW.getTime() - 3 * 60 * 60_000 + minutes * 60_000).toISOString());
    }
  });

  it("with every visit counted (the second switch), the sending pass still asks it", async () => {
    const { tx, queries } = recordingTx();
    await selectSendableMarks(tx, { tenantId: TENANT, now: NOW, limit: 50, includeNeverReminded: true });
    expect(queries.filter((q) => q.match(AFTER_THE_MARK)?.length === 1)).toHaveLength(REMINDER_OFFSETS.length * 3);
  });
});
