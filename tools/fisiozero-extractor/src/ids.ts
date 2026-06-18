// tools/fisiozero-extractor/src/ids.ts
//
// Patient-id ↔ Fisiozero `i=` param encoding.
//
// Recon (docs/QUESTIONS.md 2026-06-18): Fisiozero patient ids are sequential
// integers, passed in the `i=` query param as the base64 of their ASCII decimal
// string. Verified: 181882 → "MTgxODgy". Observed range ≈ 174159..199974, with
// gaps where records were deleted.

/** Encode an integer patient id into the Fisiozero `i=` param value. */
export function encodePatientId(id: number): string {
  if (!Number.isInteger(id) || id < 0) {
    throw new Error(`encodePatientId: expected a non-negative integer, got ${id}`);
  }
  return Buffer.from(String(id), "utf8").toString("base64");
}

/** Decode an `i=` param value back to the integer id (used for verification). */
export function decodePatientId(param: string): number {
  const decoded = Buffer.from(param, "base64").toString("utf8");
  if (!/^\d+$/.test(decoded)) {
    throw new Error(`decodePatientId: decoded value is not a decimal id`);
  }
  return Number(decoded);
}

/** Inclusive integer range [start, end]. Throws if start > end. */
export function* idRange(start: number, end: number): Generator<number> {
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new Error("idRange: start and end must be integers");
  }
  if (start > end) {
    throw new Error(`idRange: start (${start}) is greater than end (${end})`);
  }
  for (let id = start; id <= end; id++) {
    yield id;
  }
}
