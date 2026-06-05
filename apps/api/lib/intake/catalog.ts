// Patient form intake catalog — what a patient is allowed to submit.
//
// One shared general anamnese (Ficha Geral) plus per-therapy supplements. The
// catalog validates the SHAPE of a submission (which form, which therapy); the
// per-field clinical content is stored raw for therapist review (this wave does
// not validate clinical answers).
//
// Pure module: no DB, no framework, no PII.

import { getStrings, type Locale, type StringKey } from "@osteojp/i18n";

/** form_key column values. */
export const FORM_KEYS = ["ficha_geral", "supplement"] as const;
export type FormKey = (typeof FORM_KEYS)[number];

/**
 * Therapy slugs a supplement may target. Mirrors the clinical form-template keys
 * (packages/db/seed/form-templates/*.json): osteopathy, physiotherapy, rpg,
 * nesa, massagem-terapeutica, pilates-terapeutico.
 */
export const THERAPY_SLUGS = [
  "osteopathy",
  "physiotherapy",
  "rpg",
  "nesa",
  "massagem-terapeutica",
  "pilates-terapeutico",
] as const;
export type TherapySlug = (typeof THERAPY_SLUGS)[number];

/** Raw, untrusted submission input. NOTE: no patient_id/tenant_id — those are
 * derived from the verified principal, never the payload (the boundary rule). */
export type FormSubmissionInput = {
  formKey: string;
  therapy?: string | null;
  payload?: unknown;
};

/** A validated submission, normalized for persistence. */
export type ValidFormSubmission = {
  formKey: FormKey;
  /** null for the shared Ficha Geral; a therapy slug for a supplement. */
  therapy: TherapySlug | null;
  payload: Record<string, unknown>;
};

export type FormSubmissionValidation =
  | { ok: true; value: ValidFormSubmission }
  | { ok: false; error: "unknown_form" | "therapy_required" | "unknown_therapy" | "therapy_not_allowed" | "invalid_payload" };

/** i18n label key per therapy supplement (typed against the string catalog). */
const THERAPY_LABEL_KEY: Record<TherapySlug, StringKey> = {
  osteopathy: "intake.therapy.osteopathy",
  physiotherapy: "intake.therapy.physiotherapy",
  rpg: "intake.therapy.rpg",
  nesa: "intake.therapy.nesa",
  "massagem-terapeutica": "intake.therapy.massagem-terapeutica",
  "pilates-terapeutico": "intake.therapy.pilates-terapeutico",
};

export type CatalogEntry =
  | { formKey: "ficha_geral"; therapy: null; title: string }
  | { formKey: "supplement"; therapy: TherapySlug; title: string };

/**
 * The intake catalog the portal renders, localized: the shared Ficha Geral plus
 * one supplement per therapy. PT-first via @osteojp/i18n. Pure (no DB).
 */
export function describeFormCatalog(locale: Locale): CatalogEntry[] {
  const s = getStrings(locale);
  return [
    { formKey: "ficha_geral", therapy: null, title: s["intake.fichaGeral.title"] },
    ...THERAPY_SLUGS.map((therapy): CatalogEntry => ({
      formKey: "supplement",
      therapy,
      title: `${s["intake.supplement.title"]} — ${s[THERAPY_LABEL_KEY[therapy]]}`,
    })),
  ];
}

function isFormKey(v: unknown): v is FormKey {
  return typeof v === "string" && (FORM_KEYS as readonly string[]).includes(v);
}
function isTherapy(v: unknown): v is TherapySlug {
  return typeof v === "string" && (THERAPY_SLUGS as readonly string[]).includes(v);
}

/**
 * Validate + normalize a patient form submission.
 *   - ficha_geral: no therapy (a stray therapy is rejected — keeps the shared
 *     anamnese unambiguous).
 *   - supplement: a valid therapy slug is required.
 *   - payload: must be a JSON object (defaults to {} when omitted).
 */
export function validateFormSubmissionInput(
  input: FormSubmissionInput,
): FormSubmissionValidation {
  if (!isFormKey(input.formKey)) return { ok: false, error: "unknown_form" };

  const payload = input.payload ?? {};
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, error: "invalid_payload" };
  }

  if (input.formKey === "supplement") {
    if (input.therapy == null) return { ok: false, error: "therapy_required" };
    if (!isTherapy(input.therapy)) return { ok: false, error: "unknown_therapy" };
    return {
      ok: true,
      value: { formKey: "supplement", therapy: input.therapy, payload: payload as Record<string, unknown> },
    };
  }

  // ficha_geral
  if (input.therapy != null) return { ok: false, error: "therapy_not_allowed" };
  return {
    ok: true,
    value: { formKey: "ficha_geral", therapy: null, payload: payload as Record<string, unknown> },
  };
}
