/**
 * name-search.db.test.ts — the incident, against a real Postgres, through the
 * production function, with RLS on.
 *
 * ==========================================================================
 * THE INCIDENT
 * ==========================================================================
 * Reception was told a patient does not exist. The record exists.
 *
 *   Antonio Armando Ribeiro Galhofo, patient 15824, Castelo Branco.
 *   Findable by typing the WHOLE name. NOT findable by typing "Antonio Galhofo".
 *
 * Both search surfaces ran `ilike(fullName, '%' + typed + '%')` - ONE substring
 * of the WHOLE typed string, IN ORDER. "Armando Ribeiro" sits in between, so
 * the match failed and the platform answered "no patient".
 *
 * ==========================================================================
 * WHY THE FIXTURE CARRIES THE REAL NAME
 * ==========================================================================
 * It is the reported record and it is the shape that matters: FOUR tokens, the
 * typed ones FIRST and LAST, two unrelated ones in the middle. A fixture called
 * "AAA BBB" would satisfy every assertion below and would not be the bug.
 *
 * The name is stored ACCENTED here, because that is the second half of the
 * defect and the half that was invisible behind the first: `ILIKE` is
 * case-insensitive and NOT accent-insensitive, and the clinic's decade of
 * records carries both spellings of the same people.
 *
 * ==========================================================================
 * THE PRINCIPAL IS AN ASSIGNED ADMIN, AND THAT IS NOT A DETAIL
 * ==========================================================================
 * `patients_select` (0047) gives admin and reception a LOCATION arm gated on
 * `viewer_has_location_assignment()`. An UNASSIGNED admin falls through to the
 * tenant-wide branch - a different predicate, a different plan, and a different
 * visible set. Measuring or testing as one would be measuring a principal the
 * clinic does not have. Every read below runs as an admin WITH a
 * `staff_locations` row.
 *
 * ==========================================================================
 * IT GOES THROUGH `listPatientsPage`, NOT THROUGH A HAND-WRITTEN SELECT
 * ==========================================================================
 * `runScoped` sets `local role authenticated` and the real JWT claims, so what
 * is asserted is the COMPOSITE of the app-layer scope and RLS - which is the
 * only thing that decides whether reception sees a patient. A suite that
 * asserted generated SQL would go green against a statement the database
 * narrows differently.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL;
const live = Boolean(url);
const d = live ? describe : describe.skip;

d("patient name search, against a real database", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let listPatientsPage: typeof import("./list-queries").listPatientsPage;

  const tenant = randomUUID();
  const locCB = randomUUID();
  const locLV = randomUUID();
  const admin = randomUUID();
  const outsider = randomUUID();

  /** THE REPORTED RECORD. Stored accented, at Castelo Branco. */
  const pGalhofo = randomUUID();
  /** A second CB patient whose surname is shared, to make the AND load-bearing. */
  const pOtherGalhofo = randomUUID();
  /** An LV patient, stored WITHOUT accents, to prove the fold both ways. */
  const pLV = randomUUID();
  /** Shares the FIRST token with the reported record and nothing else. */
  const pSameFirstName = randomUUID();

  let n = 15820;
  const patient = (id: string, name: string, primary: string) =>
    raw`insert into patients (id, tenant_id, full_name, patient_number, primary_location_id, created_by)
        values (${id}::uuid, ${tenant}::uuid, ${name}, ${n++}, ${primary}::uuid, ${outsider}::uuid)`;

  const ctx = () =>
    ({ tenantId: tenant, role: "admin" as const, userId: admin }) as Parameters<
      typeof listPatientsPage
    >[1] & object;

  const filters = (q: string) => ({
    q,
    locationId: null,
    upcomingOnly: false,
    sort: "name" as const,
    dir: "asc" as const,
    page: 1,
  });

  /** Ids the assigned admin sees for a typed query, sorted. */
  const found = async (q: string): Promise<string[]> =>
    (await listPatientsPage(filters(q), ctx())).rows.map((r) => r.id).sort();

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ listPatientsPage } = await import("./list-queries"));

    await db.execute(
      raw`insert into tenants (id, name, slug) values (${tenant}::uuid, 'name-search', ${"ns-" + tenant.slice(0, 8)})`,
    );
    await db.execute(
      raw`insert into locations (id, tenant_id, name) values (${locCB}::uuid, ${tenant}::uuid, 'Castelo Branco')`,
    );
    await db.execute(
      raw`insert into locations (id, tenant_id, name) values (${locLV}::uuid, ${tenant}::uuid, 'Linda-a-Velha')`,
    );
    for (const [id, who] of [
      [admin, "adm"],
      [outsider, "out"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, email, full_name)
            values (${id}::uuid, ${tenant}::uuid, ${who + "-" + id.slice(0, 8) + "@example.test"}, ${who})`,
      );
    }
    // ASSIGNED to BOTH clinics: the incident is about search, not about scope,
    // and an admin who could not see CB would make every assertion below pass
    // for the wrong reason.
    for (const loc of [locCB, locLV]) {
      await db.execute(
        raw`insert into staff_locations (tenant_id, user_id, location_id)
            values (${tenant}::uuid, ${admin}::uuid, ${loc}::uuid)`,
      );
    }

    await db.execute(patient(pGalhofo, "António Armando Ribeiro Galhofo", locCB));
    await db.execute(patient(pOtherGalhofo, "Maria Fernanda Galhofo", locCB));
    await db.execute(patient(pLV, "Joao Baptista Sousa Ferreira", locLV));
    await db.execute(patient(pSameFirstName, "António Nunes Pereira", locCB));
  });

  afterAll(async () => {
    if (db) await db.execute(raw`delete from tenants where id = ${tenant}::uuid`);
  });

  // ------------------------------------------------------------------ //
  // THE REPORTED CASE
  // ------------------------------------------------------------------ //

  it("THE CONTROL: the full name still finds the record, as it always did", async () => {
    // Without this, every assertion below could pass against a search that
    // returns everything. It is also the only query reception had that worked.
    expect(await found("António Armando Ribeiro Galhofo")).toContain(pGalhofo);
  });

  it("FIRST NAME PLUS SURNAME finds it — the query that said the patient does not exist", async () => {
    expect(await found("Antonio Galhofo")).toEqual([pGalhofo]);
  });

  it("ORDER INDEPENDENT: surname first finds it too", async () => {
    expect(await found("Galhofo Antonio")).toEqual([pGalhofo]);
  });

  it("a MIDDLE token pair finds it, so the rule is 'anywhere' and not 'starts with'", async () => {
    expect(await found("Ribeiro Armando")).toEqual([pGalhofo]);
  });

  // ------------------------------------------------------------------ //
  // ACCENTS, BOTH DIRECTIONS
  // ------------------------------------------------------------------ //

  it("UNACCENTED QUERY finds an ACCENTED record (CB)", async () => {
    // Stored "António", typed "Antonio". This is the half that was invisible
    // behind the token defect.
    expect(await found("Antonio Galhofo")).toEqual([pGalhofo]);
  });

  it("ACCENTED QUERY finds an UNACCENTED record (LV)", async () => {
    // Stored "Joao", typed "João". The clinic has both spellings of the same
    // people, so a one-way fold repairs half the records and leaves the rest.
    expect(await found("João Ferreira")).toEqual([pLV]);
  });

  it("ACCENTED QUERY finds an ACCENTED record, which a naive fold can break", async () => {
    expect(await found("António Galhofo")).toEqual([pGalhofo]);
  });

  // ------------------------------------------------------------------ //
  // THE NEGATIVE ARMS. THESE ARE THE POINT.
  // ------------------------------------------------------------------ //

  it("a token that matches NOBODY returns zero rows", async () => {
    expect(await found("Zorglub")).toEqual([]);
  });

  it("a real token PLUS a token that matches nobody returns zero rows", async () => {
    // If this returned the Galhofo record, the tokens are being ORed and the
    // search has become "any of these words".
    expect(await found("Galhofo Zorglub")).toEqual([]);
  });

  it("TWO TOKENS ARE NOT AN OR: tokens matching two DIFFERENT patients return neither", async () => {
    // "Nunes" is only in pSameFirstName. "Galhofo" is only in the two Galhofos.
    // An OR would return three rows and would look like a working search while
    // handing reception a list of strangers to pick a medical record from.
    const both = await found("Nunes Galhofo");
    expect(both).toEqual([]);
  });

  it("the AND is load-bearing: each token ALONE matches more than the pair does", async () => {
    // The control for the test above. Without it, "returns []" is also what a
    // search that matches nothing at all produces.
    expect((await found("Galhofo")).sort()).toEqual([pGalhofo, pOtherGalhofo].sort());
    expect(await found("Nunes")).toEqual([pSameFirstName]);
  });

  it("a shared FIRST name alone does not collapse to one patient", async () => {
    // Two patients are "António". Typing just that must return both, or the
    // tokeniser has quietly become an exact match.
    expect((await found("Antonio")).sort()).toEqual([pGalhofo, pSameFirstName].sort());
  });

  it("an empty query is not a name filter and returns the whole visible set", async () => {
    // The one case where "matches everything" is correct. Collapsing it with
    // "matches nothing" is how an empty search box empties the patient list.
    expect((await found("")).length).toBe(4);
  });

  it("extra whitespace does not create an empty token that matches nothing", async () => {
    expect(await found("  Antonio    Galhofo  ")).toEqual([pGalhofo]);
  });

  it("a LIKE wildcard typed by a person is a literal, not a pattern", async () => {
    // `%` must not turn into "match anything". escapeLike is applied per token.
    expect(await found("Antonio% Galhofo")).toEqual([]);
  });

  // ------------------------------------------------------------------ //
  // THE DIGIT PATHS, WHICH SHARE THE SAME FUNCTION AND MUST NOT REGRESS
  // ------------------------------------------------------------------ //
  //
  // `searchMatcher` ORs the name condition with patient_number, NIF and phone.
  // This change replaced the name element of that OR, so the other three are a
  // real regression risk and NOTHING in the repository covered them through
  // this function. Asserted here rather than assumed.

  it("a PATIENT NUMBER still finds its patient", async () => {
    // The reported record is 15820 in this fixture (the counter starts there).
    expect(await found("15820")).toEqual([pGalhofo]);
  });

  it("a patient number does NOT prefix-match a longer one", async () => {
    // "1582" must not return 15820. The number is compared as a NUMBER, which
    // is the property that makes typing a short id safe.
    expect(await found("1582")).toEqual([]);
  });

  it("NAME PLUS NUMBER still resolves, through the OR rather than the name AND", async () => {
    // The name AND cannot match ("15820" is not in the name), so this can only
    // succeed via the patient-number arm. If the OR were ever tightened to an
    // AND across the whole matcher, this goes red - and reception types exactly
    // this when they have a card in front of them.
    expect(await found("Galhofo 15820")).toEqual([pGalhofo]);
  });
});
