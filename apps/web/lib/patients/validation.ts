// Input validation + search-term parsing for patients. Pure (no DB / no
// framework) so it is unit-testable in isolation. Manual validation to match
// the codebase convention (no schema library).

export class ValidationError extends Error {
  override readonly name = "ValidationError";
  constructor(message: string) {
    super(message);
  }
}

/** Raw form input. Optional fields may arrive as "", which normalizes to null. */
export type CreatePatientInput = {
  fullName: string;
  dateOfBirth?: string | null;
  sex?: string | null;
  nif?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  notes?: string | null;
};
export type UpdatePatientInput = Partial<CreatePatientInput>;

/** Validated, normalized values ready to write (empty → null). */
export type CreatePatientValues = {
  fullName: string;
  dateOfBirth: string | null;
  sex: string | null;
  nif: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  notes: string | null;
};
export type UpdatePatientValues = Partial<CreatePatientValues>;

export type MergePatientsInput = { survivorId: string; loserId: string };

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

export function parseCreatePatient(raw: CreatePatientInput): CreatePatientValues {
  const r = raw as Record<string, unknown>;
  return {
    fullName: requiredName(r.fullName),
    dateOfBirth: optionalDate(r.dateOfBirth),
    sex: optionalText(r.sex, "sex", 16),
    nif: optionalText(r.nif, "nif", 20),
    email: optionalEmail(r.email),
    phone: optionalText(r.phone, "phone", 32),
    address: optionalText(r.address, "address", 500),
    postalCode: optionalText(r.postalCode, "postalCode", 16),
    city: optionalText(r.city, "city", 200),
    notes: optionalText(r.notes, "notes", 5000),
  };
}

// Only validates keys actually present: an omitted key is left untouched by the
// caller; a present empty value clears the column (→ null).
export function parseUpdatePatient(raw: UpdatePatientInput): UpdatePatientValues {
  const r = raw as Record<string, unknown>;
  const out: UpdatePatientValues = {};
  if ("fullName" in r) out.fullName = requiredName(r.fullName);
  if ("dateOfBirth" in r) out.dateOfBirth = optionalDate(r.dateOfBirth);
  if ("sex" in r) out.sex = optionalText(r.sex, "sex", 16);
  if ("nif" in r) out.nif = optionalText(r.nif, "nif", 20);
  if ("email" in r) out.email = optionalEmail(r.email);
  if ("phone" in r) out.phone = optionalText(r.phone, "phone", 32);
  if ("address" in r) out.address = optionalText(r.address, "address", 500);
  if ("postalCode" in r) out.postalCode = optionalText(r.postalCode, "postalCode", 16);
  if ("city" in r) out.city = optionalText(r.city, "city", 200);
  if ("notes" in r) out.notes = optionalText(r.notes, "notes", 5000);
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
