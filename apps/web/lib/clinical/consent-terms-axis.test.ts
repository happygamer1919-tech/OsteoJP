import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CONSENT_ITEM_KEYS,
  CONSENT_DATA_KEY,
  emptyConsentState,
  readConsentState,
  writeConsentState,
} from "./consent";

/**
 * LOOP 5 (W13-05) — the terms acceptance is PER PATIENT and must never leak into
 * the per-RECORD `_consent` block.
 *
 * THIS TEST EXISTS BECAUSE THE MISTAKE IT PREVENTS WOULD COMPILE AND RENDER
 * CORRECTLY. Adding "terms" to CONSENT_ITEM_KEYS is the obvious way to put a
 * third checkbox in the ficha's consent block: the render loop at
 * SignatureConsent.tsx is a generic map over that array, CONSENT_ITEM_STRINGS is
 * Record<ConsentItemKey, ...> so the type system would force the i18n keys, and
 * the checkbox would appear in the right place with the right ternary state.
 *
 * And it would be WRONG. RecordForm.tsx folds that block into
 * clinical_records.data under `_consent`, which is PER CLINICAL RECORD. The
 * acceptance would exist on one record and not on the patient, the fee gate
 * would answer the wrong question, and NOT ONE EXISTING TEST WOULD FAIL —
 * every consent test asserts the per-record behaviour that is correct for
 * `treatment` and `rgpd`.
 *
 * So the defence is written on both sides, as ruled: the key set stays at two,
 * and the persisted block is asserted never to carry a terms key however it was
 * produced.
 */

describe("the consent block stays PER RECORD and keeps exactly its two items", () => {
  it("CONSENT_ITEM_KEYS is exactly [treatment, rgpd]", () => {
    // Pinned to the VALUE, not the length. A third item added by renaming one of
    // these would slip past a length check.
    expect([...CONSENT_ITEM_KEYS]).toEqual(["treatment", "rgpd"]);
  });

  it("no consent key is named for terms, under any spelling", () => {
    for (const key of CONSENT_ITEM_KEYS) {
      expect(key).not.toMatch(/term|fee|taxa|honorar/i);
    }
  });

  it("a fresh consent block carries the two items and nothing else", () => {
    expect(Object.keys(emptyConsentState()).sort()).toEqual(["rgpd", "treatment"]);
  });
});

describe("a terms key cannot survive into the persisted block", () => {
  it("writeConsentState persists only known items, so a stray terms key is dropped", () => {
    // The realistic shape of the mistake: something upstream hands the writer a
    // state object with an extra key. What lands in `data` must still be the two.
    const contaminated = {
      ...emptyConsentState(),
      terms: "granted",
    } as unknown as ReturnType<typeof emptyConsentState>;

    const data = writeConsentState({}, contaminated);
    const block = (data as Record<string, unknown>)[CONSENT_DATA_KEY] as Record<string, unknown>;

    expect(Object.keys(block).sort()).toEqual(["rgpd", "treatment"]);
    expect(block).not.toHaveProperty("terms");
  });

  it("readConsentState ignores a terms key already sitting in stored data", () => {
    // Defence for data written before this guard existed, or by hand.
    const stored = { [CONSENT_DATA_KEY]: { treatment: "granted", rgpd: "unset", terms: "granted" } };
    const state = readConsentState(stored);

    expect(Object.keys(state).sort()).toEqual(["rgpd", "treatment"]);
    expect(state).not.toHaveProperty("terms");
  });
});

describe("the per-patient acceptance has its own table, and it is append-only", () => {
  const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
  const migration = readFileSync(
    join(REPO_ROOT, "packages/db/migrations/0058_patient_terms_acceptances.sql"),
    "utf-8",
  );

  it("stores the four fields the ruling named, per patient", () => {
    expect(migration).toMatch(/create table if not exists "patient_terms_acceptances"/i);
    for (const col of ["patient_id", "accepted_at", "terms_version", "recorded_by"]) {
      expect(migration, `0058 is missing ${col}`).toContain(`"${col}"`);
    }
  });

  it("has NO update and NO delete policy — the history cannot be rewritten", () => {
    // The whole reason option B was chosen over three columns on `patients`:
    // a legal basis that overwrites its own history cannot answer what a patient
    // agreed to at a given date.
    expect(migration).not.toMatch(/create policy[^;]*for update/i);
    expect(migration).not.toMatch(/create policy[^;]*for delete/i);
  });

  it("revokes the write grants too, so a mistakenly-added policy still cannot write", () => {
    expect(migration).toMatch(/revoke\s+update,\s*delete,\s*truncate/i);
  });

  it("pins recorded_by to auth.uid() in the INSERT policy", () => {
    // The one field a caller could lie about, and the one the record's
    // evidential value rests on.
    expect(migration).toMatch(/recorded_by\s*=\s*auth\.uid\(\)/);
  });

  it("carries no clinical content and no free-text note column", () => {
    // Identifiers, an instant and a version string. `terms_version` is the
    // document's identity, never its text.
    expect(migration).not.toMatch(/"notes"|"body"|"content"/i);
  });
});
