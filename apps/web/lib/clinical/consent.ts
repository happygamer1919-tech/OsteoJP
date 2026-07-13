// Ficha Médica consent model (SPEC-ficha-medica.md sec 5.14 / sec 7).
//
// Two individually-confirmable consent items - TREATMENT consent and RGPD data
// processing (W5-33 owner ruling 2026-07-12; the wording is now final; the earlier
// speculative sms / dataHandling items and their drafted variants were removed,
// SMS communication stays governed by the per-patient reminder opt-out flag) - 
// persisted MIGRATION-FREE inside the clinical record's `data`
// jsonb under the reserved `_consent` key (an underscore-prefixed key never
// collides with a template field or with the twelve AI ingestion keys;
// validateRecordData only checks required template fields, so the extra key
// rides along untouched).
//
// Each item is ALWAYS in an EXPLICIT ternary state - `granted` (check), `denied`
// (X), or `unset` (no decision recorded yet). The UI never renders a bare
// unchecked box: `unset` shows an explicit "por decidir" chip, and the clinician
// toggles each item to an affirmative check OR an affirmative X (SPEC sec 7.3).
//
// Pure module - no DB, no React, no `server-only`. Fully unit-testable.
//
// WORDING: the consent texts are FINAL (owner-delegated, W5-33, JP one-time
// read-through before real-patient use), carried as i18n keys
// (clinical.consent.<item>.label / .body), pt-PT authoritative + faithful en-GB.

import type { StringKey } from "@osteojp/i18n";

/** The two consent items, in display order (SPEC sec 7.3; W5-33). */
export const CONSENT_ITEM_KEYS = ["treatment", "rgpd"] as const;
export type ConsentItemKey = (typeof CONSENT_ITEM_KEYS)[number];

/**
 * The explicit per-item state. `unset` is a first-class state (no decision yet)
 * and is rendered as an explicit "por decidir" indicator - NEVER a bare
 * unchecked box (SPEC sec 7.3).
 */
export type ConsentDecision = "granted" | "denied" | "unset";

/** Persisted consent block, stored under clinical_records.data._consent. */
export type ConsentState = Record<ConsentItemKey, ConsentDecision>;

/** Reserved key under `data` where the consent block lives (migration-free). */
export const CONSENT_DATA_KEY = "_consent" as const;

/** A fresh, decision-free consent block (every item explicitly `unset`). */
export function emptyConsentState(): ConsentState {
  return { treatment: "unset", rgpd: "unset" };
}

function isDecision(v: unknown): v is ConsentDecision {
  return v === "granted" || v === "denied" || v === "unset";
}

/**
 * Read the persisted consent block from a record's `data`, tolerating a legacy
 * record with no block (returns all-`unset`) or a partial/garbage block (each
 * missing/invalid item falls back to `unset`). Never throws.
 */
export function readConsentState(data: unknown): ConsentState {
  const out = emptyConsentState();
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const block = (data as Record<string, unknown>)[CONSENT_DATA_KEY];
    if (block && typeof block === "object" && !Array.isArray(block)) {
      const b = block as Record<string, unknown>;
      for (const key of CONSENT_ITEM_KEYS) {
        if (isDecision(b[key])) out[key] = b[key] as ConsentDecision;
      }
    }
  }
  return out;
}

/**
 * Return a new `data` object with the consent block merged under the reserved
 * key, leaving every template field untouched. Pure (no mutation of the input).
 */
export function writeConsentState(
  data: Record<string, unknown>,
  consent: ConsentState,
): Record<string, unknown> {
  return { ...data, [CONSENT_DATA_KEY]: consent };
}

/** i18n label + final body keys for one consent item. */
export type ConsentItemStrings = {
  /** Short item title (e.g. "Consentimento para tratamento"). */
  label: StringKey;
  /** The final body shown to the patient (owner-delegated, W5-33). */
  body: StringKey;
};

/**
 * The i18n keys for each consent item's label + final body. Keys exist in BOTH
 * strings.pt.json and strings.en.json (pt authoritative, en faithful).
 */
export const CONSENT_ITEM_STRINGS: Record<ConsentItemKey, ConsentItemStrings> = {
  treatment: {
    label: "clinical.consent.treatment.label",
    body: "clinical.consent.treatment.body",
  },
  rgpd: {
    label: "clinical.consent.rgpd.label",
    body: "clinical.consent.rgpd.body",
  },
};
