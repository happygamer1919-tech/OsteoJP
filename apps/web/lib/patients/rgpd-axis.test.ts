import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { CONSENT_ITEM_KEYS } from "../clinical/consent";

/**
 * RGPD-01 — the per-patient RGPD consent is its OWN append-only table, and the
 * three shapes it was NOT allowed to take stay closed.
 *
 * THIS TEST EXISTS BECAUSE ALL THREE WRONG SHAPES WOULD COMPILE AND RENDER.
 *
 *   1. A third key in CONSENT_ITEM_KEYS. The ficha's consent block is a generic
 *      map over that array, so an "rgpd at patient level" item would appear in
 *      the right place with the right ternary — and land in
 *      clinical_records.data, which is PER RECORD. A patient registered today
 *      has no record at all, so the fact would have nowhere to live.
 *   2. Two columns on `patients`. Smaller migration, and refused by the same
 *      owner ruling that refused it for terms (0058): re-consenting under a new
 *      RGPD text would OVERWRITE the old row, and a legal basis that overwrites
 *      its own history cannot answer what a patient consented to in March.
 *   3. Rows in `patient_terms_acceptances`. It has no document-kind column and
 *      its latest row feeds the no-show fee gate (W13-05), so an RGPD row there
 *      would answer that gate's question with a different document's consent.
 *
 * The migration is asserted from its FILE rather than from a live database, so
 * the properties below hold on any checkout whether or not 0093 is applied to
 * the database the suite happens to reach. It was parked unnumbered in
 * migrations-pending until 2026-09-23, when it was promoted to 0093 with its
 * bytes unchanged.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATION_PATH = join(
  REPO_ROOT,
  "packages/db/migrations/0093_patient_rgpd_acceptances.sql",
);

describe("the RGPD consent migration is promoted once, as 0093, and additive", () => {
  it("is numbered exactly once, and the pending copy is gone", () => {
    expect(existsSync(MIGRATION_PATH), "0093_patient_rgpd_acceptances.sql is missing").toBe(true);
    // Two numbered copies would be two journal entries for one table; a pending
    // copy left behind is a second source of truth for the same bytes.
    const numbered = readdirSync(join(REPO_ROOT, "packages/db/migrations")).filter((f) =>
      f.includes("patient_rgpd_acceptances"),
    );
    expect(numbered).toEqual(["0093_patient_rgpd_acceptances.sql"]);
    const pending = readdirSync(join(REPO_ROOT, "packages/db/migrations-pending"));
    expect(pending.some((f) => f.includes("patient_rgpd_acceptances"))).toBe(false);
  });

  it("touches no existing table", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf-8");
    // The whole point of shape 2 being refused: no column is added to patients,
    // so no existing row is rewritten and no backfill is owed.
    expect(migration).not.toMatch(/alter\s+table\s+"?patients"?/i);
    expect(migration).not.toMatch(/alter\s+table\s+"?patient_terms_acceptances"?/i);
    expect(migration).not.toMatch(/\bupdate\s+public\./i);
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
  });
});

describe("the RGPD consent table is append-only, enforced by the database", () => {
  const migration = readFileSync(MIGRATION_PATH, "utf-8");

  it("stores the four fields the ruling named, per patient", () => {
    expect(migration).toMatch(/create table if not exists "patient_rgpd_acceptances"/i);
    for (const col of ["patient_id", "accepted_at", "rgpd_version", "recorded_by"]) {
      expect(migration, `the migration is missing ${col}`).toContain(`"${col}"`);
    }
  });

  it("has NO update and NO delete policy — the history cannot be rewritten", () => {
    expect(migration).not.toMatch(/create policy[^;]*for update/i);
    expect(migration).not.toMatch(/create policy[^;]*for delete/i);
  });

  it("revokes the write grants too, so a mistakenly-added policy still cannot write", () => {
    // Supabase's schema-wide DEFAULT PRIVILEGES hand `authenticated` UPDATE,
    // DELETE and TRUNCATE at CREATE time. Without this line the table looks
    // append-only and is not.
    expect(migration).toMatch(/revoke\s+update,\s*delete,\s*truncate/i);
  });

  it("GRANTS select and insert, so the append-only assertions cannot pass vacuously", () => {
    // 0058's own scar: its first draft carried the REVOKE and no GRANT, so
    // `authenticated` held no privilege at all, every statement was refused,
    // and the append-only assertions passed FOR THE WRONG REASON.
    expect(migration).toMatch(/grant\s+select,\s*insert\s+on\s+public\.patient_rgpd_acceptances/i);
  });

  it("pins recorded_by to auth.uid() in the INSERT policy", () => {
    // The one field a caller could lie about, and the one the row's evidential
    // value rests on. The database decides it, not the server action.
    expect(migration).toMatch(/recorded_by\s*=\s*auth\.uid\(\)/);
  });

  it("gives the patient role nothing", () => {
    expect(migration).toMatch(/revoke\s+all\s+on\s+public\.patient_rgpd_acceptances\s+from\s+patient/i);
  });

  it("carries no clinical content and no free-text note column", () => {
    // Identifiers, an instant and a version string. `rgpd_version` is the
    // document's identity, never its text.
    expect(migration).not.toMatch(/"notes"|"body"|"content"|"text_body"/i);
  });
});

describe("the per-record consent block is untouched", () => {
  it("CONSENT_ITEM_KEYS is still exactly [treatment, rgpd]", () => {
    // Pinned to the VALUE. This is shape 1: the patient-level consent must not
    // have been smuggled in as a third per-record item.
    expect([...CONSENT_ITEM_KEYS]).toEqual(["treatment", "rgpd"]);
  });
});

/**
 * THE FICHA'S CHIP, PINNED TO ITS SOURCE.
 *
 * The badge is rendered by an async server component, so there is no seam a
 * unit test can render. What a test CAN pin is which value the chip hangs on.
 *
 * THIS IS THE GUARD ON THE TWO SURFACES STAYING SEPARATE. The owner ruled this
 * per-patient table authoritative for the badge and left the per-record
 * `_consent.rgpd` tick independent. If someone later makes the ficha consult
 * that tick to decide the chip, a per-RECORD decision starts answering a
 * per-PATIENT legal question, and a patient with no record at all has nowhere
 * for the fact to live. These arms go red if that happens.
 *
 * The behavioural half lives in `rgpd-acceptance.test.ts`, which proves the read
 * touches this table and no other.
 */
describe("the ficha badge hangs on the per-patient acceptance", () => {
  const page = readFileSync(join(REPO_ROOT, "apps/web/app/patients/[id]/page.tsx"), "utf-8");

  it("takes its value from getLatestRgpdAcceptance", () => {
    expect(page).toMatch(/const rgpdAcceptance = await getLatestRgpdAcceptance\(ctx, patient\.id\)/);
  });

  it("renders the chip on the ABSENCE of that value", () => {
    // `!rgpdAcceptance` — the absence of a row IS the badge, which is why no
    // existing patient needed a backfill.
    expect(page).toMatch(/!rgpdAcceptance[\s\S]{0,300}patients\.rgpdMissingBadge/);
  });

  it("never reads the per-record consent block to decide it", () => {
    expect(page).not.toMatch(/readConsentState|CONSENT_DATA_KEY|_consent/);
  });
});
