// Input validation + search-term parsing for patients. Pure (no DB / no
// framework) so it is unit-testable in isolation. Manual validation to match
// the codebase convention (no schema library).

import { checkNif, type NifProblem } from "./nif";

export class ValidationError extends Error {
  override readonly name = "ValidationError";
  constructor(message: string) {
    super(message);
  }
}

/**
 * PL-31 — one message per way a NIF can be wrong, so the desk is told what to
 * DO rather than that something is invalid. The consumidor-final case is the
 * one that matters most in practice: it is a correct-looking number that means
 * "no NIF given", so its message points at the exemption instead of implying
 * the digits were mistyped.
 */
const NIF_MESSAGES: Record<NifProblem, string> = {
  empty:
    "NIF é obrigatório. Se o paciente não tem NIF português, marque \"Estrangeiro / sem NIF\" e indique o motivo.",
  not_nine_digits: "NIF inválido: deve ter exatamente 9 dígitos.",
  bad_prefix: "NIF inválido: não é um número de contribuinte português válido.",
  bad_checksum: "NIF inválido: o dígito de controlo não confere. Verifique os 9 dígitos.",
  consumidor_final:
    "999999990 é o NIF de consumidor final, não identifica o paciente. Se o paciente não tem NIF português, marque \"Estrangeiro / sem NIF\" e indique o motivo.",
};

function nifError(problem: NifProblem): ValidationError {
  return new ValidationError(NIF_MESSAGES[problem]);
}

/** Raw form input. Optional fields may arrive as "", which normalizes to null. */
export type CreatePatientInput = {
  fullName: string;
  dateOfBirth?: string | null;
  sex?: string | null;
  nif?: string | null;
  // PL-31 — the exemption, not a second NIF. Ticked when the patient genuinely
  // has no PT NIF (a foreigner); the reason is then mandatory.
  nifExempt?: boolean;
  nifExemptReason?: string | null;
  // PL-23 — health insurance plans, a list because a patient may hold more than
  // one. Entries arrive from the form and are normalized/capped below.
  healthInsuranceNumbers?: HealthInsuranceEntry[] | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  profession?: string | null;
  // W5-11 — "Como nos conheceu?" referral source. A single free-text field
  // holding either the chosen option label or the Outro free-text.
  referralSource?: string | null;
  contraindicationEpilepsy?: boolean;
  contraindicationPregnancy?: boolean;
  contraindicationPacemaker?: boolean;
  // W12-25: decoupled "Outra" contraindication + its free-text note.
  contraindicationOther?: boolean;
  contraindicationOtherNote?: string | null;
  // R16 (0043) — the create action's location context, captured EXPLICITLY and
  // server-side (never inferred from created_by.staff_locations). Persisted to
  // patients.primary_location_id as the clinical_records admin FALLBACK location,
  // consulted ONLY for zero-appointment patients. Optional: absent -> null ->
  // unassigned (owner-only) until an appointment establishes the location basis.
  // Tenant consistency is verified server-side in createPatient.
  primaryLocationId?: string | null;
};
export type UpdatePatientInput = Partial<CreatePatientInput>;

/** Validated, normalized values ready to write (empty → null). */
export type CreatePatientValues = {
  fullName: string;
  dateOfBirth: string | null;
  sex: string | null;
  nif: string | null;
  nifExempt: boolean;
  nifExemptReason: string | null;
  healthInsuranceNumbers: HealthInsuranceEntry[];
  email: string | null;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  profession: string | null;
  referralSource: string | null;
  contraindicationEpilepsy: boolean;
  contraindicationPregnancy: boolean;
  contraindicationPacemaker: boolean;
  contraindicationOther: boolean;
  contraindicationOtherNote: string | null;
  // R16 (0043) — validated (UUID or null); tenant-consistency checked in the action.
  primaryLocationId: string | null;
};
export type UpdatePatientValues = Partial<CreatePatientValues>;

export type MergePatientsInput = { survivorId: string; loserId: string };

/** PL-23 — one health-insurance plan: the number, and who it is with. */
export type HealthInsuranceEntry = { insurer: string | null; number: string };

/**
 * At most this many plans per patient. Not a clinical limit - a bound, so a
 * scripted caller cannot push an unbounded array into a jsonb column that is
 * read on every patient page.
 */
export const MAX_HEALTH_INSURANCE_ENTRIES = 10;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Trim, cap length, and normalize "" → null for an optional free-text field.
function optionalText(v: unknown, field: string, max: number): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new ValidationError(`${field} must be text`);
  const t = v.trim();
  if (t.length === 0) return null;
  if (t.length > max) throw new ValidationError(`${field} is too long`);
  return t;
}

function requiredName(v: unknown): string {
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new ValidationError("fullName is required");
  }
  const t = v.trim();
  if (t.length > 200) throw new ValidationError("fullName is too long");
  return t;
}

function optionalEmail(v: unknown): string | null {
  const t = optionalText(v, "email", 320);
  if (t === null) return null;
  if (!EMAIL_RE.test(t)) throw new ValidationError("Invalid email");
  return t;
}

function optionalDate(v: unknown): string | null {
  const t = optionalText(v, "dateOfBirth", 10);
  if (t === null) return null;
  if (!ISO_DATE_RE.test(t)) {
    throw new ValidationError("Invalid date (expected YYYY-MM-DD)");
  }
  return t;
}

/**
 * PL-24 (owner CR 2026-07-31): "the sex should have only option of either man
 * either woman". So the column accepts `male`, `female`, or nothing recorded —
 * there is no third value, and the server says so rather than trusting the
 * form's option list. Removing the <option> alone would leave a hand-posted
 * "other" free to re-enter the column it was just removed from.
 *
 * Guards WRITES only. A legacy row already holding another value keeps it and
 * simply displays as "Não especificado"; nothing rewrites patient data in bulk.
 */
const SEX_VALUES = new Set(["male", "female"]);

function optionalSex(v: unknown): string | null {
  const t = optionalText(v, "sex", 16);
  if (t === null) return null;
  if (!SEX_VALUES.has(t)) throw new ValidationError("Invalid sex");
  return t;
}

/**
 * PL-23 — normalize the insurance list: trim, drop entries with no NUMBER (an
 * insurer with no number is not a plan, it is a half-filled row the user
 * abandoned), cap the count and each field's length.
 *
 * An absent key returns null so `parseUpdatePatient` can leave the column
 * untouched; an explicitly EMPTY array is a real value meaning "this patient
 * has no plans", and clears the column.
 */
function optionalInsuranceList(v: unknown): HealthInsuranceEntry[] | null {
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v)) throw new ValidationError("healthInsuranceNumbers must be a list");
  if (v.length > MAX_HEALTH_INSURANCE_ENTRIES) {
    throw new ValidationError("too many health insurance entries");
  }
  const out: HealthInsuranceEntry[] = [];
  for (const raw of v) {
    if (typeof raw !== "object" || raw === null) {
      throw new ValidationError("healthInsuranceNumbers entries must be objects");
    }
    const entry = raw as Record<string, unknown>;
    const number = optionalText(entry.number, "insurance number", 60);
    if (number === null) continue;
    out.push({ insurer: optionalText(entry.insurer, "insurer", 120), number });
  }
  return out;
}

/**
 * PL-31 — the NIF rule, in one place because create and update must not drift.
 *
 * Two shapes are acceptable and nothing else:
 *   - a well-formed PT NIF, and no exemption; or
 *   - the exemption ticked, with a written reason, and the NIF left empty.
 *
 * `requirePresence` is the ONLY difference between creating and editing, and it
 * is the whole reason this takes a flag rather than being two functions. On
 * CREATE the owner's rule binds: no NIF and no exemption is refused. On UPDATE
 * it must not, because patients registered before 2026-08-03 legitimately have
 * neither, and demanding one would make every legacy ficha unsavable — turning
 * a data-quality rule into a wall across records that already exist.
 *
 * What update does NOT relax is FORMAT: a NIF typed during an edit is checked
 * exactly as hard as one typed at creation. Only presence is negotiable.
 */
function resolveNif(
  r: Record<string, unknown>,
  requirePresence: boolean,
): { nif: string | null; nifExempt: boolean; nifExemptReason: string | null } {
  const exempt = r.nifExempt === true;
  const rawNif = optionalText(r.nif, "nif", 20);

  if (exempt) {
    const reason = optionalText(r.nifExemptReason, "nifExemptReason", 200);
    if (reason === null) {
      throw new ValidationError(
        "Indique o motivo pelo qual o paciente não tem NIF (ex.: estrangeiro, passaporte).",
      );
    }
    // An exemption AND a NIF is a contradiction, and silently keeping one of
    // them would leave the record asserting both. The NIF wins nothing here:
    // the user ticked the box deliberately, so the box is the answer and the
    // stale digits are dropped.
    return { nif: null, nifExempt: true, nifExemptReason: reason };
  }

  if (rawNif === null) {
    if (requirePresence) throw nifError("empty");
    return { nif: null, nifExempt: false, nifExemptReason: null };
  }

  const problem = checkNif(rawNif);
  if (problem !== null) throw nifError(problem);
  // Store the normalized 9 digits, not what was typed: "123 456 789" and
  // "123456789" are the same NIF and must not become two different strings in
  // a column that invoices are matched on.
  return { nif: rawNif.replace(/[\s.\-]/g, ""), nifExempt: false, nifExemptReason: null };
}

function optionalUuid(v: unknown, field: string): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new ValidationError(`${field} must be a UUID`);
  const t = v.trim();
  if (t.length === 0) return null;
  if (!UUID_RE.test(t)) throw new ValidationError(`Invalid ${field}`);
  return t;
}

export function parseCreatePatient(raw: CreatePatientInput): CreatePatientValues {
  const r = raw as Record<string, unknown>;
  // PL-31 — presence REQUIRED here. This is "cannot move forward without it".
  const nif = resolveNif(r, true);
  return {
    fullName: requiredName(r.fullName),
    dateOfBirth: optionalDate(r.dateOfBirth),
    sex: optionalSex(r.sex),
    nif: nif.nif,
    nifExempt: nif.nifExempt,
    nifExemptReason: nif.nifExemptReason,
    healthInsuranceNumbers: optionalInsuranceList(r.healthInsuranceNumbers) ?? [],
    email: optionalEmail(r.email),
    phone: optionalText(r.phone, "phone", 32),
    address: optionalText(r.address, "address", 500),
    postalCode: optionalText(r.postalCode, "postalCode", 16),
    city: optionalText(r.city, "city", 200),
    profession: optionalText(r.profession, "profession", 200),
    referralSource: optionalText(r.referralSource, "referralSource", 200),
    contraindicationEpilepsy: r.contraindicationEpilepsy === true,
    contraindicationPregnancy: r.contraindicationPregnancy === true,
    contraindicationPacemaker: r.contraindicationPacemaker === true,
    contraindicationOther: r.contraindicationOther === true,
    contraindicationOtherNote: optionalText(r.contraindicationOtherNote, "contraindicationOtherNote", 500),
    primaryLocationId: optionalUuid(r.primaryLocationId, "primaryLocationId"),
  };
}

// Only validates keys actually present: an omitted key is left untouched by the
// caller; a present empty value clears the column (→ null).
export function parseUpdatePatient(raw: UpdatePatientInput): UpdatePatientValues {
  const r = raw as Record<string, unknown>;
  const out: UpdatePatientValues = {};
  if ("fullName" in r) out.fullName = requiredName(r.fullName);
  if ("dateOfBirth" in r) out.dateOfBirth = optionalDate(r.dateOfBirth);
  if ("sex" in r) out.sex = optionalSex(r.sex);
  // PL-31 — NIF and its exemption move TOGETHER: they are one rule expressed in
  // two columns, so a payload touching either is re-resolved as a pair. Editing
  // only the NIF while a stale exemption sat in the row would otherwise produce
  // exactly the both-at-once state resolveNif exists to prevent.
  // Presence is NOT required here: see resolveNif — legacy patients have no NIF
  // and must stay editable.
  if ("nif" in r || "nifExempt" in r || "nifExemptReason" in r) {
    const nif = resolveNif(r, false);
    out.nif = nif.nif;
    out.nifExempt = nif.nifExempt;
    out.nifExemptReason = nif.nifExemptReason;
  }
  if ("healthInsuranceNumbers" in r) {
    out.healthInsuranceNumbers = optionalInsuranceList(r.healthInsuranceNumbers) ?? [];
  }
  if ("email" in r) out.email = optionalEmail(r.email);
  if ("phone" in r) out.phone = optionalText(r.phone, "phone", 32);
  if ("address" in r) out.address = optionalText(r.address, "address", 500);
  if ("postalCode" in r) out.postalCode = optionalText(r.postalCode, "postalCode", 16);
  if ("city" in r) out.city = optionalText(r.city, "city", 200);
  if ("profession" in r) out.profession = optionalText(r.profession, "profession", 200);
  if ("referralSource" in r) out.referralSource = optionalText(r.referralSource, "referralSource", 200);
  if ("contraindicationEpilepsy" in r) out.contraindicationEpilepsy = r.contraindicationEpilepsy === true;
  if ("contraindicationPregnancy" in r) out.contraindicationPregnancy = r.contraindicationPregnancy === true;
  if ("contraindicationPacemaker" in r) out.contraindicationPacemaker = r.contraindicationPacemaker === true;
  if ("contraindicationOther" in r) out.contraindicationOther = r.contraindicationOther === true;
  if ("contraindicationOtherNote" in r)
    out.contraindicationOtherNote = optionalText(r.contraindicationOtherNote, "contraindicationOtherNote", 500);
  // PL-15b — the clinic is editable (create already accepted it; update did not,
  // so a mis-filed or location-less patient could never be corrected from the UI).
  // Absent key = untouched; "" = cleared; a uuid is tenant-checked in the action.
  if ("primaryLocationId" in r)
    out.primaryLocationId = optionalUuid(r.primaryLocationId, "primaryLocationId");
  return out;
}

export function parseMergeInput(raw: MergePatientsInput): MergePatientsInput {
  const r = raw as Record<string, unknown>;
  const survivorId = typeof r.survivorId === "string" ? r.survivorId : "";
  const loserId = typeof r.loserId === "string" ? r.loserId : "";
  if (!UUID_RE.test(survivorId) || !UUID_RE.test(loserId)) {
    throw new ValidationError("Invalid patient id");
  }
  if (survivorId === loserId) {
    throw new ValidationError("Cannot merge a patient into itself");
  }
  return { survivorId, loserId };
}

/* ------------------------------------------------------------------ */
/* Search-term parsing                                                */
/* ------------------------------------------------------------------ */

export type ParsedSearch = {
  /** Trimmed, collapsed free text. Empty string means "no query". */
  text: string;
  /** Digits only (NIF / phone matching), separators stripped. */
  digits: string;
};

/** Escape LIKE/ILIKE wildcards in user input so `%` and `_` are literal. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function parseSearch(raw: string): ParsedSearch {
  const text = raw.trim().replace(/\s+/g, " ");
  const digits = text.replace(/\D/g, "");
  return { text, digits };
}
