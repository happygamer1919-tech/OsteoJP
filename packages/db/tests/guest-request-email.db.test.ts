/**
 * guest-request-email.db.test.ts: 0101 (held), the optional email on a public
 * booking request (strategy ruling R40, dispatch S-1004-A).
 *
 * The migration is packages/db/migrations-pending/NEXT-AFTER-0100_guest_request_email.sql
 * until it is promoted. So this file ASKS THE SCHEMA WHICH SIDE IT IS ON:
 *   1. NEVER HALF. 0101 is one transaction: one column and one CHECK, two parts.
 *      Both, or neither; anything else THROWS, and nothing here is measured.
 *   2. THE PROMOTION FLIPS IT. Once a .sql file in packages/db/migrations adds the
 *      column, a database WITHOUT it THROWS: from the promotion commit on, these
 *      arms cannot be skipped.
 *   3. ONLY THE ARM THAT APPLIES IS REGISTERED, NEVER SKIPPED. Before the
 *      promotion, CI's db-tests applies supabase/migrations, which does not hold a
 *      pending file, so the database is on the pre-0101 side and the one arm
 *      registered there says so in its title and asserts that side whole: "not
 *      measured", never "fine". `.github/scripts/assert-rls-executed.mjs` reddens
 *      the required DB-gated check for any suite with a test that did not run, so
 *      a `describe.skip` for the other arm would fail CI (the same reason
 *      apps/api/lib/guest-intake/write.db.test.ts registers one arm). The build
 *      lane runs the applied arm on a lane stack with 0101 applied
 *      (docs/migration-apply-0101.md, "Rehearsal"), and CI runs it from the
 *      promotion on, with no edit to this file.
 *
 * WITHOUT DATABASE_URL (the unit job) the one registered arm is `describe.skip`,
 * as every DB-gated suite in this repository is.
 *
 * WHAT IT MEASURES, each as the role the application really uses:
 *   - THE COLUMN: text, nullable, no default; a row written without it reads NULL;
 *   - THE WRITER: the public form's insert runs on the owning role's connection
 *     (getDbAdmin, packages/db/src/client.ts), so the owner connection writes an
 *     email and reads it back. `authenticated` still cannot INSERT (0065), with
 *     or without an email;
 *   - THE READERS, under real RLS: `set local role authenticated` and the JWT
 *     claims the app's contexts set, in a transaction that always rolls back.
 *     Staff of the request's tenant read the email. STAFF OF ANOTHER TENANT READ
 *     NO ROW OF IT, beside reading their own tenant's row, so "nothing" is never a
 *     pass on an empty set. A session with no claims reads nothing; `anon` and
 *     `patient` are refused at the table (42501);
 *   - THE CHECK, fired for real: each refusal is asserted by the constraint's
 *     NAME with every NOT NULL column filled, so a refusal by some other
 *     constraint cannot pass for it (the lesson of patient-locale.db.test.ts);
 *   - NO STRICTER THAN THE APPLICATION: the application's own rule is read out of
 *     apps/web/lib/patients/validation.ts (never copied here), and every value it
 *     admits must be admitted by the CHECK.
 *
 * NO REAL NAME, NUMBER OR ADDRESS. Every id is random per run, every address is
 * under example.invalid, and afterAll removes what beforeAll wrote.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql, TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Rollback, asRole, claimsFor, connect, live } from "./rls-harness";

const CHECK_NAME = "guest_booking_requests_email_check";
/** The application's own length bound (apps/web/lib/patients/validation.ts, optionalEmail). */
const APP_MAX = 320;

/** The promoted migration files that add the column, if any. */
function promotedFiles(): string[] {
  const dir = join(__dirname, "..", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => /ADD COLUMN email text\s+CONSTRAINT guest_booking_requests_email_check/.test(readFileSync(join(dir, f), "utf8")));
}

/** Which side of 0101 this database is on. Throws on anything but a whole side. */
async function applied0101(): Promise<boolean> {
  if (!live) return false;
  const probe = connect();
  try {
    const [r] = await probe<{ n: number }[]>`
      select (
        (select count(*) from pg_attribute
          where attrelid = 'public.guest_booking_requests'::regclass and attname = 'email' and not attisdropped)
        + (select count(*) from pg_constraint
            where conrelid = 'public.guest_booking_requests'::regclass and conname = ${CHECK_NAME})
      )::int as n`;
    const n = r?.n ?? -1;
    let applied: boolean;
    if (n === 2) applied = true;
    else if (n === 0) applied = false;
    else {
      throw new Error(
        `0101 IS HALF APPLIED: ${n} of 2 parts present (the column, its CHECK). 0101 applies as one transaction, ` +
          "so this database was built some other way. Nothing here was measured.",
      );
    }
    const promoted = promotedFiles();
    if (promoted.length > 0 && !applied) {
      throw new Error(
        `0101 IS PROMOTED (${promoted.join(", ")} adds guest_booking_requests.email) BUT THIS DATABASE DOES NOT HAVE IT. ` +
          "From the promotion on, the pre-0101 answer is no longer acceptable. Nothing here was measured.",
      );
    }
    return applied;
  } finally {
    await probe.end({ timeout: 5 });
  }
}

/** The application's email rule, read from its source so this file cannot drift from it. */
function appEmailRule(): RegExp {
  const src = readFileSync(join(__dirname, "..", "..", "..", "apps", "web", "lib", "patients", "validation.ts"), "utf8");
  const m = /^const EMAIL_RE = \/(.+)\/;$/m.exec(src);
  if (!m?.[1]) throw new Error("apps/web/lib/patients/validation.ts no longer declares EMAIL_RE on one line; this test reads it from there");
  if (!/optionalText\(v, "email", 320\)/.test(src)) throw new Error("the application's email length bound is no longer 320; the CHECK was written against 320");
  return new RegExp(m[1]);
}

/** What the application does with a typed value: trim, refuse over 320, test the rule. null is "no email". */
function appAdmits(rule: RegExp, typed: string): { stored: string | null; ok: boolean } {
  const t = typed.trim();
  if (t.length === 0) return { stored: null, ok: true };
  if (t.length > APP_MAX) return { stored: t, ok: false };
  return { stored: t, ok: rule.test(t) };
}

const w101 = await applied0101();
const SIDE = w101 ? "0101 APPLIED" : "0101 NOT APPLIED on this database (the arms run once 0101 is applied)";
const dLive = live ? describe : describe.skip;

const W = {
  tenant: randomUUID(),
  other: randomUUID(),
  roleT: randomUUID(),
  roleX: randomUUID(),
  staffT: randomUUID(),
  staffX: randomUUID(),
  locT: randomUUID(),
  locX: randomUUID(),
  svcT: randomUUID(),
  svcX: randomUUID(),
  reqWith: randomUUID(),
  reqWithout: randomUUID(),
  reqX: randomUUID(),
  patientT: randomUUID(),
};
const EMAIL_T = `guest-${W.reqWith.slice(0, 8)}@example.invalid`;
const EMAIL_X = `guest-${W.reqX.slice(0, 8)}@example.invalid`;

/** A request row with every NOT NULL column filled, so only the email can be what is refused. */
const requestRow = (tenant: "t" | "x", extra: Record<string, unknown>): Record<string, unknown> => ({
  id: randomUUID(),
  tenant_id: tenant === "t" ? W.tenant : W.other,
  full_name: "Fixture Guest",
  phone: "+351910000000",
  service_id: tenant === "t" ? W.svcT : W.svcX,
  location_id: tenant === "t" ? W.locT : W.locX,
  requested_starts_at: new Date("2030-01-07T09:00:00Z"),
  requested_ends_at: new Date("2030-01-07T13:00:00Z"),
  ...extra,
});

if (w101) dLive(`0101, the optional email on a public booking request [${SIDE}]`, () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    for (const [t, role, staff, loc, svc, tag] of [
      [W.tenant, W.roleT, W.staffT, W.locT, W.svcT, "t"],
      [W.other, W.roleX, W.staffX, W.locX, W.svcX, "x"],
    ] as const) {
      await sql`insert into tenants (id, name, slug) values (${t}, ${`Guest Email ${tag}`}, ${`guest-email-${t}`})`;
      await sql`insert into roles (id, tenant_id, slug, name) values (${role}, ${t}, 'reception', 'Reception')`;
      await sql`insert into users (id, tenant_id, role_id, email, full_name)
                values (${staff}, ${t}, ${role}, ${`staff-${staff}@example.invalid`}, 'Fixture Staff')`;
      await sql`insert into locations (id, tenant_id, name) values (${loc}, ${t}, ${`Fixture Clinic ${tag}`})`;
      await sql`insert into services (id, tenant_id, location_id, name) values (${svc}, ${t}, ${loc}, 'Fixture Service')`;
    }
    await sql`insert into patients (id, tenant_id, full_name) values (${W.patientT}, ${W.tenant}, 'Fixture Patient')`;
    // THE WRITER'S CONNECTION: the owner, as getDbAdmin is. Three requests: one with an
    // email and one without in tenant T, one with an email in tenant X.
    await sql`insert into public.guest_booking_requests ${sql(requestRow("t", { id: W.reqWith, email: EMAIL_T }))}`;
    await sql`insert into public.guest_booking_requests ${sql(requestRow("t", { id: W.reqWithout }))}`;
    await sql`insert into public.guest_booking_requests ${sql(requestRow("x", { id: W.reqX, email: EMAIL_X }))}`;
  });

  afterAll(async () => {
    if (!sql) return;
    for (const t of [W.tenant, W.other]) {
      await sql`delete from guest_booking_requests where tenant_id = ${t}`;
      await sql`delete from patients where tenant_id = ${t}`;
      await sql`delete from services where tenant_id = ${t}`;
      await sql`delete from locations where tenant_id = ${t}`;
      await sql`delete from users where tenant_id = ${t}`;
      await sql`delete from roles where tenant_id = ${t}`;
      await sql`delete from tenants where id = ${t}`;
    }
    await sql.end();
  });

  /** Run `fn` as a role the harness's asRole does not name (anon), always rolled back. */
  async function asAnon<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe("set local role anon");
        throw new Rollback(await fn(tx));
      });
      throw new Error("unreachable: transaction committed without rollback");
    } catch (err) {
      if (err instanceof Rollback) return err.value as T;
      throw err;
    }
  }

  /** Try one email on the owner connection, in a transaction that always rolls back. */
  async function tryEmail(email: string | null): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      await sql.begin(async (tx) => {
        await tx`insert into public.guest_booking_requests ${tx(requestRow("t", { email }))}`;
        throw new Rollback(null);
      });
      throw new Error("unreachable: transaction committed without rollback");
    } catch (err) {
      if (err instanceof Rollback) return { ok: true };
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  it("THE COLUMN is text, nullable, with no default, and it is the table's last column", async () => {
    const [c] = await sql<{ typ: string; notnull: boolean; hasdef: boolean; missing: boolean; num: number; last: number; acl: string | null }[]>`
      select format_type(a.atttypid, a.atttypmod) as typ, a.attnotnull as notnull, a.atthasdef as hasdef,
             a.atthasmissing as missing, a.attnum::int as num, a.attacl::text as acl,
             (select max(attnum)::int from pg_attribute where attrelid = a.attrelid and not attisdropped) as last
        from pg_attribute a
       where a.attrelid = 'public.guest_booking_requests'::regclass and a.attname = 'email' and not a.attisdropped`;
    expect(c).toEqual({ typ: "text", notnull: false, hasdef: false, missing: false, num: c!.last, last: c!.last, acl: null });
  });

  it("THE WRITER (the owning role, as the public form's insert) stores an email and reads it back; a row written without one reads NULL", async () => {
    const rows = await sql<{ id: string; email: string | null }[]>`
      select id, email from public.guest_booking_requests where tenant_id = ${W.tenant} order by email nulls last`;
    expect(rows).toEqual([
      { id: W.reqWith, email: EMAIL_T },
      { id: W.reqWithout, email: null },
    ]);
  });

  it("authenticated still cannot INSERT a request, with or without an email (0065): the form's path stays the only one", async () => {
    for (const extra of [{}, { email: "staff-insert@example.invalid" }]) {
      await expect(
        asRole(sql, "authenticated", claimsFor(W.tenant, "reception", W.staffT), (tx) =>
          tx`insert into public.guest_booking_requests ${tx(requestRow("t", extra))}`),
      ).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("STAFF OF THE REQUEST'S TENANT read the email; STAFF OF ANOTHER TENANT read no row of it, beside their own", async () => {
    // THE PREMISE, on the owner connection: all three rows exist, two of them with an email.
    const premise = await sql<{ id: string; email: string | null }[]>`
      select id, email from public.guest_booking_requests where id in ${sql([W.reqWith, W.reqWithout, W.reqX])} order by id`;
    expect(premise.map((r) => r.id).sort()).toEqual([W.reqWith, W.reqWithout, W.reqX].sort());
    expect(premise.filter((r) => r.email !== null)).toHaveLength(2);

    const read = (tx: TransactionSql) =>
      tx<{ id: string; email: string | null }[]>`
        select id, email from public.guest_booking_requests where id in ${tx([W.reqWith, W.reqWithout, W.reqX])} order by email nulls last`;

    const own = await asRole(sql, "authenticated", claimsFor(W.tenant, "reception", W.staffT), read);
    expect(own).toEqual([
      { id: W.reqWith, email: EMAIL_T },
      { id: W.reqWithout, email: null },
    ]);

    const foreign = await asRole(sql, "authenticated", claimsFor(W.other, "reception", W.staffX), read);
    expect(foreign).toEqual([{ id: W.reqX, email: EMAIL_X }]);

    // The address itself is not reachable by a predicate either: a foreign staff
    // member searching for tenant T's address finds nothing.
    const byAddress = await asRole(sql, "authenticated", claimsFor(W.other, "reception", W.staffX), (tx) =>
      tx<{ n: number }[]>`select count(*)::int as n from public.guest_booking_requests where email = ${EMAIL_T}`);
    expect(byAddress[0]?.n).toBe(0);
    const byAddressOwn = await asRole(sql, "authenticated", claimsFor(W.tenant, "reception", W.staffT), (tx) =>
      tx<{ n: number }[]>`select count(*)::int as n from public.guest_booking_requests where email = ${EMAIL_T}`);
    expect(byAddressOwn[0]?.n).toBe(1);
  });

  it("a session with NO claims reads nothing, and anon and patient are refused at the table", async () => {
    const none = await asRole(sql, "authenticated", null, (tx) =>
      tx<{ n: number }[]>`select count(*)::int as n from public.guest_booking_requests where id in ${tx([W.reqWith, W.reqX])}`);
    expect(none[0]?.n).toBe(0);
    await expect(asAnon((tx) => tx`select email from public.guest_booking_requests limit 1`)).rejects.toMatchObject({ code: "42501" });
    await expect(
      asRole(sql, "patient", JSON.stringify({ tenant_id: W.tenant, patient_id: W.patientT }), (tx) =>
        tx`select email from public.guest_booking_requests limit 1`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("staff UPDATE reaches the email of their own tenant's request and of no other tenant's", async () => {
    const mine = await asRole(sql, "authenticated", claimsFor(W.tenant, "reception", W.staffT), (tx) =>
      tx<{ id: string }[]>`update public.guest_booking_requests set email = 'changed@example.invalid' where id = ${W.reqWith} returning id`);
    expect(mine.map((r) => r.id)).toEqual([W.reqWith]);
    const theirs = await asRole(sql, "authenticated", claimsFor(W.other, "reception", W.staffX), (tx) =>
      tx<{ id: string }[]>`update public.guest_booking_requests set email = 'changed@example.invalid' where id = ${W.reqWith} returning id`);
    expect(theirs).toEqual([]);
    // asRole rolled both back: the stored address is the fixture's.
    const [still] = await sql<{ email: string | null }[]>`select email from public.guest_booking_requests where id = ${W.reqWith}`;
    expect(still?.email).toBe(EMAIL_T);
  });

  it("THE CHECK admits NULL, an ordinary address and one of exactly 320 characters", async () => {
    const local = "a".repeat(APP_MAX - "@example.invalid".length);
    for (const good of [null, "guest@example.invalid", "first.last+tag@sub.example.invalid", `${local}@example.invalid`, "utilizador.ção@exemplo.invalid"]) {
      const r = await tryEmail(good);
      expect(r, `refused ${good === null ? "NULL" : `a ${good.length}-character address`}`).toEqual({ ok: true });
    }
    expect(`${local}@example.invalid`).toHaveLength(APP_MAX);
  });

  it("THE CHECK REFUSES an over-long value and every malformed one, by firing the constraint", async () => {
    const tooLong = `${"a".repeat(APP_MAX - "@example.invalid".length + 1)}@example.invalid`;
    expect(tooLong).toHaveLength(APP_MAX + 1);
    const bad: Array<[string, string]> = [
      [tooLong, "321 characters"],
      ["", "the empty string (no email is NULL)"],
      ["guest.example.invalid", "no @"],
      ["guest@@example.invalid", "two @ together"],
      ["guest@example@invalid.pt", "two @ apart"],
      ["guest@example", "no dot after the @"],
      ["@example.invalid", "nothing before the @"],
      ["guest@.invalid", "nothing between the @ and the dot"],
      ["guest@example.", "nothing after the last dot"],
      ["guest name@example.invalid", "a space inside"],
      [" guest@example.invalid", "a leading space"],
      ["guest@example.invalid ", "a trailing space"],
      ["guest@example.invalid\n", "a trailing line feed"],
      ["guest\t@example.invalid", "a tab inside"],
      ["guest@exam\rple.invalid", "a carriage return inside"],
      ["guest@example.inv\falid", "a form feed inside"],
      ["guest@example.inv\valid", "a vertical tab inside"],
    ];
    // EVERY FORBIDDEN CHARACTER IN EVERY PART, built rather than picked: the six ASCII whitespace
    // characters and a second @, each inside the part before the @, the part after it and the part
    // after the last dot. One hand-picked example per character would leave most of the 21 cells of
    // the CHECK's three character classes unread.
    const parts = { "the part before the @": ["gu", "est@example.invalid"], "the part after the @": ["guest@exa", "mple.invalid"], "the part after the last dot": ["guest@example.inv", "alid"] } as const;
    const forbidden = { "a space": " ", "a tab": "\t", "a line feed": "\n", "a carriage return": "\r", "a form feed": "\f", "a vertical tab": "\v", "an @": "@" } as const;
    let cells = 0;
    for (const [where, [head, tail]] of Object.entries(parts)) {
      for (const [what, ch] of Object.entries(forbidden)) {
        bad.push([`${head}${ch}${tail}`, `${what} inside ${where}`]);
        cells += 1;
      }
    }
    expect(cells).toBe(21);
    for (const [value, why] of bad) {
      const r = await tryEmail(value);
      expect(r.ok, `the CHECK admitted ${why}`).toBe(false);
      if (!r.ok) expect(r.message, why).toMatch(new RegExp(CHECK_NAME));
    }
  });

  it("NO STRICTER THAN THE APPLICATION: every value the application's own rule admits, the CHECK admits", async () => {
    const rule = appEmailRule();
    const typed = [
      "guest@example.invalid",
      "  guest@example.invalid  ",
      "GUEST@EXAMPLE.INVALID",
      "a@b.c",
      "first.last+tag@sub.domain.example.invalid",
      "o'neil@example.invalid",
      "utilizador.ção@exemplo.invalid",
      "用户@例子.invalid",
      "guest@localhost.localdomain",
      "guest@ex--ample.invalid",
      "..@...",
      "gu\u0085est@example.invalid",
      "gu​est@example.invalid",
      `${"a".repeat(APP_MAX - 16)}@example.invalid`,
      `${"😀".repeat(150)}@example.invalid`,
      "guest@example.invalid ",
      "gu est@example.invalid",
      "gu est@example.invalid",
      "gu﻿est@example.invalid",
      "gu est@example.invalid",
      "guest@example",
      "guest",
      `${"a".repeat(APP_MAX)}@example.invalid`,
      "",
      "   ",
    ];
    let admittedByApp = 0;
    let refusedByApp = 0;
    for (const t of typed) {
      const app = appAdmits(rule, t);
      if (!app.ok) {
        refusedByApp += 1;
        continue;
      }
      admittedByApp += 1;
      const db = await tryEmail(app.stored);
      expect(db, `the application admits ${JSON.stringify(t).slice(0, 60)} and the CHECK refuses it`).toEqual({ ok: true });
    }
    // Neither side of the corpus is empty, so the loop above measured something.
    expect(admittedByApp).toBeGreaterThanOrEqual(12);
    expect(refusedByApp).toBeGreaterThanOrEqual(6);
    // THE CASE THE POSIX CLASS WOULD BREAK: U+0085 is not whitespace to the application.
    expect(appAdmits(rule, "gu\u0085est@example.invalid").ok).toBe(true);
    // LOOSER ON PURPOSE, pinned so nobody reads it as a hole: a no-break space inside is
    // refused by the application and admitted by the CHECK, which is a backstop, not the validator.
    expect(appAdmits(rule, "gu est@example.invalid").ok).toBe(false);
    expect(await tryEmail("gu est@example.invalid")).toEqual({ ok: true });
  });
});

else dLive(`0101 is not applied on this database, so its arms were NOT measured [${SIDE}]`, () => {
  it("the table has no email column and no email CHECK: the pre-0101 side, whole", async () => {
    const sql = connect();
    try {
      const [r] = await sql<{ col: number; con: number }[]>`
        select (select count(*)::int from pg_attribute
                 where attrelid = 'public.guest_booking_requests'::regclass and attname = 'email' and not attisdropped) as col,
               (select count(*)::int from pg_constraint
                 where conrelid = 'public.guest_booking_requests'::regclass and conname = ${CHECK_NAME}) as con`;
      expect(r).toEqual({ col: 0, con: 0 });
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
