// Ficha Médica RGPD / data-consent model (SPEC-ficha-medica.md sec 5.14 / sec 7).
//
// Three individually-confirmable consent items — RGPD data processing, SMS
// reminders acknowledgment, data handling — persisted MIGRATION-FREE inside the
// clinical record's `data` jsonb under the reserved `_consent` key (an
// underscore-prefixed key never collides with a template field or with the
// twelve AI ingestion keys; validateRecordData only checks required template
// fields, so the extra key rides along untouched).
//
// Each item is ALWAYS in an EXPLICIT ternary state — `granted` (check), `denied`
// (X), or `unset` (no decision recorded yet). The UI never renders a bare
// unchecked box: `unset` shows an explicit "por decidir" chip, and the clinician
// toggles each item to an affirmative check OR an affirmative X (SPEC sec 7.3).
//
// Pure module — no DB, no React, no `server-only`. Fully unit-testable.
//
// WORDING: every consent/RGPD string is a pt-PT PLACEHOLDER flagged PENDENTE-JP,
// carried as i18n keys (clinical.consent.*Body / *.v1 / *.v2 / *.v3). NO string
// here is final: JP picks a variant (Q-W5-3). The i18n keys hold the active
// placeholder; the 2-3 drafted variants per text live as alternate keys
// (…​.v1/.v2/.v3) so JP can compare and select without a code change.

import type { StringKey } from "@osteojp/i18n";

/** The three consent items, in display order (SPEC sec 7.3). */
export const CONSENT_ITEM_KEYS = ["rgpd", "sms", "dataHandling"] as const;
export type ConsentItemKey = (typeof CONSENT_ITEM_KEYS)[number];

/**
 * The explicit per-item state. `unset` is a first-class state (no decision yet)
 * and is rendered as an explicit "por decidir" indicator — NEVER a bare
 * unchecked box (SPEC sec 7.3).
 */
export type ConsentDecision = "granted" | "denied" | "unset";

/** Persisted consent block, stored under clinical_records.data._consent. */
export type ConsentState = Record<ConsentItemKey, ConsentDecision>;

/** Reserved key under `data` where the consent block lives (migration-free). */
export const CONSENT_DATA_KEY = "_consent" as const;

/** A fresh, decision-free consent block (every item explicitly `unset`). */
export function emptyConsentState(): ConsentState {
  return { rgpd: "unset", sms: "unset", dataHandling: "unset" };
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

/** i18n label + PENDENTE-JP body keys for one consent item. */
export type ConsentItemStrings = {
  /** Short item title (e.g. "Tratamento de dados (RGPD)"). */
  label: StringKey;
  /** The ACTIVE placeholder body shown to the patient (PENDENTE-JP). */
  body: StringKey;
  /** The 2-3 drafted variants JP chooses between (PENDENTE-JP, alternate keys). */
  variants: StringKey[];
};

/**
 * The i18n keys for each consent item's label + active body + drafted variants.
 * The body is a PENDENTE-JP placeholder; `variants` are the alternate drafts JP
 * selects from (Q-W5-3). Keys exist in BOTH strings.pt.json and strings.en.json.
 */
export const CONSENT_ITEM_STRINGS: Record<ConsentItemKey, ConsentItemStrings> = {
  rgpd: {
    label: "clinical.consent.rgpd.label",
    body: "clinical.consent.rgpd.body",
    variants: [
      "clinical.consent.rgpd.v1",
      "clinical.consent.rgpd.v2",
      "clinical.consent.rgpd.v3",
    ],
  },
  sms: {
    label: "clinical.consent.sms.label",
    body: "clinical.consent.sms.body",
    variants: [
      "clinical.consent.sms.v1",
      "clinical.consent.sms.v2",
      "clinical.consent.sms.v3",
    ],
  },
  dataHandling: {
    label: "clinical.consent.dataHandling.label",
    body: "clinical.consent.dataHandling.body",
    variants: [
      "clinical.consent.dataHandling.v1",
      "clinical.consent.dataHandling.v2",
      "clinical.consent.dataHandling.v3",
    ],
  },
};
