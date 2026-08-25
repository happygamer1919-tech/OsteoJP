/**
 * phone-e164-parity.db.test.ts — the two implementations of one rule, run
 * against each other on every commit.
 *
 * ============================================================================
 * WHY THIS EXISTS, AND IT IS THE PRICE OF MIGRATION 0062
 * ============================================================================
 * `normalizePhonePT` (TypeScript) and `patients.phone_e164` (a GENERATED column,
 * migration 0062) compute the same thing. **Two implementations of one rule is a
 * divergence waiting to happen**, and this project has paid for that shape
 * repeatedly — most recently when a probe's timeout option was silently ignored
 * and four runs reported a booking as missing that was there the whole time.
 *
 * A comment claiming "the SQL mirrors the TypeScript" is worth nothing. This
 * runs BOTH over one corpus and requires **identical answers on every input**.
 *
 * The generated column could not be avoided: whatever writes a patient row — the
 * staff form, the portal PATCH, a seed, or LAUNCH-03's importer bringing ~10,000
 * legacy records with a decade of inconsistent formatting — the derived value has
 * to be right. Only the database can promise that. So the duplication is
 * deliberate, and this test is what makes it safe.
 *
 * ============================================================================
 * WHY IT IS DB-GATED AND NOT A UNIT TEST
 * ============================================================================
 * The SQL side only exists in a database. Evaluating it any other way — by
 * reimplementing the CASE in JavaScript, or by asserting the migration's text —
 * would be a third implementation agreeing with itself, which is the
 * self-mocking shape LOOP 6's citation audit caught in `fichas/read.test.ts` and
 * which `patient-linkage.test.ts` still has: its fake `select()` returns whatever
 * the test set, so it proves the query is ASSEMBLED correctly and cannot prove it
 * FINDS anything.
 *
 * It writes real rows and reads back what the database derived.
 *
 * ============================================================================
 * THE ONE KNOWN BOUNDARY, ASSERTED RATHER THAN HOPED FOR
 * ============================================================================
 * JavaScript's `\s` includes Unicode spaces (U+00A0 and friends). POSIX
 * `[[:space:]]` under this server's collation may not. A number pasted from a
 * document with a non-breaking space could therefore normalize in TypeScript and
 * not in SQL.
 *
 * That case is IN the corpus. If the two disagree there, this test fails and the
 * disagreement is a known, dated fact rather than a surprise found by a patient
 * who cannot log in. **It fails closed either way** — the SQL yielding NULL means
 * the patient is refused exactly as they are today, never linked to a wrong row.
 */
import { randomUUID } from "node:crypto";

import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { normalizePhonePT } from "@osteojp/notify";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

/**
 * Every shape this column will actually meet, plus the ones that break naive
 * implementations.
 *
 * DERIVED FROM THE PRODUCT, not invented: the four accepted forms are the ones
 * `normalizePhonePT`'s own doc comment lists; the separator cases are how
 * Portuguese numbers are written; the over-long and under-long cases are where a
 * regex that anchors loosely silently accepts a wrong number.
 */
const CORPUS: Array<{ input: string; why: string }> = [
  // The four documented accepted forms.
  { input: "912345678", why: "bare 9-digit subscriber, how a patient writes their own" },
  { input: "+351912345678", why: "already E.164, passthrough" },
  { input: "00351912345678", why: "international 00 prefix" },
  { input: "351912345678", why: "country code with no + and no 00" },

  // Separators, which is the whole reason this defect existed.
  { input: "+351 912 345 678", why: "spaces — the seed's format and a receptionist's" },
  { input: "912 345 678", why: "spaces, no country code" },
  { input: "+351-912-345-678", why: "dashes" },
  { input: "+351.912.345.678", why: "dots" },
  { input: "(351) 912345678", why: "parentheses" },
  { input: " 912345678 ", why: "leading and trailing space" },

  // Geographic (landline) numbers start with 2 and are VALID for this column.
  // #865's isSmsCapablePT rejects them for SMS; normalization is a separate rule
  // and must not quietly do the SMS check's job.
  { input: "212345678", why: "geographic line, valid subscriber, not SMS-capable" },
  { input: "+351 212 345 678", why: "geographic with spaces" },

  // Rejections. Each must be NULL on BOTH sides.
  { input: "", why: "empty" },
  { input: "   ", why: "whitespace only" },
  { input: "812345678", why: "leading 8 — not a PT subscriber range" },
  { input: "91234567", why: "eight digits, one short" },
  { input: "9123456789", why: "ten digits, one long" },
  { input: "+3519123456789", why: "ten digits after +351 — the over-long trap" },
  { input: "3519123456789", why: "thirteen digits — fails the exactly-twelve gate" },
  { input: "+44 20 7946 0958", why: "a UK number — foreign numbers are NOT normalized" },
  { input: "not a phone", why: "free text somebody typed into the field" },
  { input: "912345678 ext 4", why: "an extension appended" },

  // THE KNOWN BOUNDARY. U+00A0 is stripped by JS \s; POSIX [[:space:]] may not
  // strip it. In the corpus so a disagreement is a dated fact, not a surprise.
  { input: "+351 912 345 678", why: "non-breaking spaces, as pasted from a document" },
];

d("phone_e164 (SQL) and normalizePhonePT (TypeScript) agree", () => {
  let db: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let tenantId: string;

  beforeAll(async () => {
    db = (await import("@osteojp/db")).getDbAdmin();
    tenantId = randomUUID();
    await db.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Parity Co', ${"par-" + tenantId.slice(0, 8)})`);
  });

  afterAll(async () => {
    if (!db) return;
    await db.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  it("the corpus is not empty and covers both outcomes", () => {
    // ANTI-VACUOUS. A corpus that shrank to nothing, or to rejections only,
    // would let the parity assertion below pass having compared nothing
    // interesting. `test.each` over an empty array passes silently — the shape
    // this project has now found seven times.
    expect(CORPUS.length).toBeGreaterThanOrEqual(20);
    const accepted = CORPUS.filter((c) => normalizePhonePT(c.input) !== null);
    const rejected = CORPUS.filter((c) => normalizePhonePT(c.input) === null);
    expect(accepted.length, "the corpus must contain numbers that normalize").toBeGreaterThanOrEqual(12);
    expect(rejected.length, "and numbers that do not").toBeGreaterThanOrEqual(8);
  });

  it("every input in the corpus derives the same value on both sides", async () => {
    // ONE ROW PER INPUT, INSERTED AND READ BACK. The value is never computed in
    // JavaScript from the SQL's definition and never asserted from the
    // migration's text: it is whatever the database actually stored.
    const disagreements: string[] = [];

    for (const { input, why } of CORPUS) {
      const id = randomUUID();
      await db.execute(raw`insert into patients (id, tenant_id, full_name, phone)
        values (${id}, ${tenantId}, 'Paridade', ${input})`);

      const rows = await db.execute<{ phone_e164: string | null }>(
        raw`select phone_e164 from patients where id = ${id}`,
      );
      const fromSql = (rows as unknown as Array<{ phone_e164: string | null }>)[0]?.phone_e164 ?? null;
      const fromTs = normalizePhonePT(input);

      if (fromSql !== fromTs) {
        // THE INPUT IS PRINTED AS A CODEPOINT LIST, NOT RAW. These are fixture
        // numbers, not patient data, but the habit is the rule (PII #7) and an
        // escaped form is also the only way to SEE a non-breaking space in a CI
        // log — which is precisely the disagreement most likely to appear here.
        const escaped = [...input].map((ch) => (ch.charCodeAt(0) < 127 ? ch : `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`)).join("");
        disagreements.push(`"${escaped}" (${why}): SQL=${String(fromSql)} TS=${String(fromTs)}`);
      }
    }

    expect(
      disagreements,
      "THE GENERATED COLUMN AND normalizePhonePT DISAGREE. Migration 0062's CASE " +
        "expression and apps/api/lib/notify/phone.ts must compute the same thing, " +
        "or a patient normalizes one way for the login and another for the SMS:\n  " +
        disagreements.join("\n  "),
    ).toEqual([]);
  });

  it("the derived column REFUSES to be written directly", async () => {
    // GENERATED ALWAYS is the promise this whole design rests on: no write path
    // can set phone_e164 to something other than what `phone` implies. If that
    // ever became a plain column, every guarantee above quietly weakens and
    // nothing else would notice.
    const id = randomUUID();
    await expect(
      db.execute(raw`insert into patients (id, tenant_id, full_name, phone, phone_e164)
        values (${id}, ${tenantId}, 'Escrita Directa', '912345678', '+351999999999')`),
    ).rejects.toThrow();
  });

  it("the derived value FOLLOWS an update to phone, with no write of its own", async () => {
    // The property a trigger-free design buys, and the reason an
    // application-side write was rejected: correcting the stored number
    // corrects the login key in the same statement, on every path, forever.
    const id = randomUUID();
    await db.execute(raw`insert into patients (id, tenant_id, full_name, phone)
      values (${id}, ${tenantId}, 'Actualizacao', 'not a phone')`);

    const before = await db.execute<{ phone_e164: string | null }>(
      raw`select phone_e164 from patients where id = ${id}`,
    );
    expect((before as unknown as Array<{ phone_e164: string | null }>)[0]?.phone_e164).toBeNull();

    await db.execute(raw`update patients set phone = '+351 912 345 678' where id = ${id}`);

    const after = await db.execute<{ phone_e164: string | null }>(
      raw`select phone_e164 from patients where id = ${id}`,
    );
    expect((after as unknown as Array<{ phone_e164: string | null }>)[0]?.phone_e164).toBe(
      "+351912345678",
    );
  });
});
