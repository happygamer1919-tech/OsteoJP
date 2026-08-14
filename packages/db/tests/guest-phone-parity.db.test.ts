import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, live } from "./rls-harness";

/**
 * GUEST-02 — `guest_booking_requests.phone_e164` and `patients.phone_e164` MUST
 * read a number identically. This is a SHIPPING GATE on the guest flow.
 *
 * WHY IT IS A GATE AND NOT A NICETY. Reception's "this may be somebody you
 * already have" flag is a join between those two columns. If they ever
 * normalise differently the join returns nothing — and NOTHING IS THE BENIGN
 * ANSWER. No screen reports an error, no log records a problem; a returning
 * patient is simply, silently, treated as a new person, and the clinic acquires
 * a duplicate record for somebody it already knows.
 *
 * That is the vacuous-guard shape this project has counted 123 instances of,
 * sitting on a verdict path. It is exactly the family §1.3 of the rehydrate doc
 * is about: an unhandled case mapping onto a known, harmless-looking one.
 *
 * THE DUPLICATION IS DELIBERATE AND RECORDED. 0063 carries 0062's CASE
 * expression verbatim because collapsing both into one SQL function means
 * rewriting a generated column on `patients`, a table holding live clinical
 * data — its own migration with its own apply. Until that happens, THIS TEST IS
 * WHAT MAKES THE COPY SAFE.
 *
 * THE CORPUS IS DELIBERATELY THE SAME SHAPE AS
 * apps/api/lib/auth/phone-e164-parity.db.test.ts, including the traps that file
 * found worth pinning: the over-long number, the non-breaking space, the
 * geographic prefix. A parity test with an easier corpus than its sibling would
 * pass while the sibling failed, which is worse than having no test.
 */

const T = "00000000-0000-0000-0000-0000000a6001";
const ROLE = "00000000-0000-0000-0000-0000000a6002";
const USER = "00000000-0000-0000-0000-0000000a6003";
const LOC = "00000000-0000-0000-0000-0000000a6004";
const SVC = "00000000-0000-0000-0000-0000000a6005";

const CORPUS: Array<{ input: string; why: string }> = [
  { input: "+351912345678", why: "already E.164, passthrough" },
  { input: "912345678", why: "bare subscriber, how a person writes their own" },
  { input: "912 345 678", why: "spaces, how a receptionist types it" },
  { input: "+351 912 345 678", why: "prefix and spaces, the seed's format" },
  { input: "+351-912-345-678", why: "dashes" },
  { input: "+351.912.345.678", why: "dots" },
  { input: "(+351) 912 345 678", why: "parenthesised prefix" },
  { input: "00351912345678", why: "the international 00 prefix" },
  { input: "351912345678", why: "country code, no + and no 00" },
  { input: "+351 912 345 678", why: "NON-BREAKING spaces, as pasted from a document" },
  { input: "+351212345678", why: "geographic (landline) — a valid PT number" },
  { input: "212345678", why: "bare geographic" },
  { input: "+3519123456789", why: "TEN digits after +351 — the over-long trap" },
  { input: "91234567", why: "eight digits — too short" },
  { input: "+34912345678", why: "Spanish, not PT" },
  { input: "not a number at all", why: "free text somebody typed in the field" },
  { input: "", why: "empty string" },
  { input: "+351812345678", why: "8 prefix — not a PT subscriber range" },
  { input: "+351 912 345 678 ext 4", why: "an extension appended" },
  { input: "0912345678", why: "leading zero, a common mistype" },
];

async function seed(sql: Sql): Promise<void> {
  await sql`insert into tenants (id, name, slug)
            values (${T}, 'Guest Parity', ${`guest-parity-${T}`})`;
  await sql`insert into roles (id, tenant_id, slug, name)
            values (${ROLE}, ${T}, 'therapist', 'Therapist')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${USER}, ${T}, ${ROLE}, ${`gp-${USER}@example.pt`}, 'Guest Parity')`;
  await sql`insert into locations (id, tenant_id, name)
            values (${LOC}, ${T}, 'Linda-a-Velha')`;
  await sql`insert into services (id, tenant_id, location_id, name)
            values (${SVC}, ${T}, ${LOC}, 'Consulta')`;
}

describe.skipIf(!live)("GUEST-02 - guest and patient phone normalisation agree", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seed(sql);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from tenants where id = ${T}`;
    await sql.end();
  });

  it("the corpus is big enough and covers BOTH outcomes", async () => {
    // A corpus of only-valid numbers would pass on a guest column that never
    // returned NULL, and a corpus of only-invalid ones on a column that always
    // did. Both sides must be represented or the test proves very little.
    expect(CORPUS.length).toBeGreaterThanOrEqual(20);
    const ids = { ok: 0, nul: 0 };
    for (const { input } of CORPUS) {
      const id = randomUUID();
      await sql`insert into patients (id, tenant_id, full_name, phone)
                values (${id}, ${T}, 'Corpus', ${input})`;
      const rows = await sql<{ phone_e164: string | null }[]>`
        select phone_e164 from patients where id = ${id}`;
      if (rows[0]?.phone_e164 == null) ids.nul++;
      else ids.ok++;
    }
    expect(ids.ok, "corpus has no VALID numbers").toBeGreaterThan(0);
    expect(ids.nul, "corpus has no INVALID numbers").toBeGreaterThan(0);
  });

  it("every input derives the SAME value in both tables", async () => {
    // ONE ROW PER INPUT IN EACH TABLE, INSERTED AND READ BACK. Neither value is
    // computed in JavaScript and neither is asserted from a migration's text:
    // both are whatever the database actually stored.
    const disagreements: string[] = [];

    for (const { input, why } of CORPUS) {
      const patientId = randomUUID();
      const guestId = randomUUID();

      await sql`insert into patients (id, tenant_id, full_name, phone)
                values (${patientId}, ${T}, 'Paridade', ${input})`;
      await sql`insert into guest_booking_requests
                  (id, tenant_id, full_name, phone, service_id, location_id,
                   requested_starts_at, requested_ends_at)
                values (${guestId}, ${T}, 'Paridade', ${input}, ${SVC}, ${LOC},
                        '2026-09-07T09:00:00Z', '2026-09-07T10:00:00Z')`;

      const p = await sql<{ phone_e164: string | null }[]>`
        select phone_e164 from patients where id = ${patientId}`;
      const g = await sql<{ phone_e164: string | null }[]>`
        select phone_e164 from guest_booking_requests where id = ${guestId}`;

      const fromPatients = p[0]?.phone_e164 ?? null;
      const fromGuests = g[0]?.phone_e164 ?? null;

      if (fromPatients !== fromGuests) {
        // Printed as codepoints, not raw: these are fixtures rather than patient
        // data, but the habit is the rule (PII #7), and an escaped form is the
        // only way to SEE a non-breaking space in a CI log - which is precisely
        // the disagreement most likely to turn up here.
        const escaped = [...input]
          .map((ch) => (ch.charCodeAt(0) < 127 ? ch : `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`))
          .join("");
        disagreements.push(
          `"${escaped}" (${why}): patients=${String(fromPatients)} guests=${String(fromGuests)}`,
        );
      }
    }

    expect(
      disagreements,
      "THE TWO GENERATED COLUMNS DISAGREE. 0062's expression and 0063's copy of " +
        "it must compute the same thing, or reception's possible-existing-patient " +
        "flag silently stops matching and a returning patient is treated as new:\n  " +
        disagreements.join("\n  "),
    ).toEqual([]);
  });

  it("THE FLAG ITSELF WORKS: a guest whose number matches a patient is found by the join", async () => {
    // The parity above is the mechanism; this is the outcome it exists for.
    // Without this arm, both columns could be uniformly NULL and every parity
    // assertion would still pass.
    const patientId = randomUUID();
    const guestId = randomUUID();
    await sql`insert into patients (id, tenant_id, full_name, phone)
              values (${patientId}, ${T}, 'Cliente Antigo', '+351 912 000 111')`;
    await sql`insert into guest_booking_requests
                (id, tenant_id, full_name, phone, service_id, location_id,
                 requested_starts_at, requested_ends_at)
              values (${guestId}, ${T}, 'Cliente Antigo', '912000111', ${SVC}, ${LOC},
                      '2026-09-07T09:00:00Z', '2026-09-07T10:00:00Z')`;

    // Written the SAME WAY the two are written in real life: the patient with
    // spaces from a receptionist, the guest bare from a phone keypad.
    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n
      from public.patients p
      join public.guest_booking_requests g on g.phone_e164 = p.phone_e164
      where g.id = ${guestId} and p.tenant_id = ${T} and g.tenant_id = ${T}
        and p.phone_e164 is not null`;
    expect(rows[0]?.n, "the possible-existing-patient flag did not match").toBe(1);
  });

  it("NEGATIVE ARM: a guest whose number matches NOBODY is not flagged", async () => {
    // The counterweight to the arm above. A join that matched everything would
    // pass that test and be worse than useless.
    const guestId = randomUUID();
    await sql`insert into guest_booking_requests
                (id, tenant_id, full_name, phone, service_id, location_id,
                 requested_starts_at, requested_ends_at)
              values (${guestId}, ${T}, 'Pessoa Nova', '+351 913 999 888', ${SVC}, ${LOC},
                      '2026-09-07T09:00:00Z', '2026-09-07T10:00:00Z')`;
    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n
      from public.patients p
      join public.guest_booking_requests g on g.phone_e164 = p.phone_e164
      where g.id = ${guestId} and p.tenant_id = ${T} and g.tenant_id = ${T}
        and p.phone_e164 is not null`;
    expect(rows[0]?.n).toBe(0);
  });

  it("NEGATIVE ARM: two NULL normalisations do not match each other", async () => {
    // NULL = NULL is not true in SQL, and this asserts the join relies on that
    // rather than on the `is not null` guard alone. Without it, every guest who
    // typed a foreign number would match every patient who did.
    const patientId = randomUUID();
    const guestId = randomUUID();
    await sql`insert into patients (id, tenant_id, full_name, phone)
              values (${patientId}, ${T}, 'Estrangeiro A', '+34912345678')`;
    await sql`insert into guest_booking_requests
                (id, tenant_id, full_name, phone, service_id, location_id,
                 requested_starts_at, requested_ends_at)
              values (${guestId}, ${T}, 'Estrangeiro B', '+34999888777', ${SVC}, ${LOC},
                      '2026-09-07T09:00:00Z', '2026-09-07T10:00:00Z')`;
    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n
      from public.patients p
      join public.guest_booking_requests g on g.phone_e164 = p.phone_e164
      where g.id = ${guestId} and p.tenant_id = ${T} and g.tenant_id = ${T}`;
    expect(rows[0]?.n).toBe(0);
  });
});
