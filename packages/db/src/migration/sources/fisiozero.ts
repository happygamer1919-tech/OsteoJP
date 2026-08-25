// packages/db/src/migration/sources/fisiozero.ts
//
// THE FISIOZERO ADAPTER. Maps the vendor's CSV export onto the intermediate
// shapes in ../types.ts. It touches nothing else: staging, validate and upsert
// are unchanged and consume this output exactly as they consume any other.
//
// ==========================================================================
// AUTHORED BLIND, AND THAT IS A RULE RATHER THAN A CIRCUMSTANCE
// ==========================================================================
// CLAUDE.md, "Patient data isolation (Fisiozero import)": no terminal opens,
// reads or samples a delivery file. Every column name below comes from the
// SANITIZED STRUCTURE REPORT produced by scripts/import/probe-amostra.mjs and
// pasted by the owner. No fixture in the test suite is a real row.
//
// THIS MODULE READS NO FILES, deliberately. It takes CSV TEXT that the caller
// has already loaded. That keeps `packages/db` free of fs access, makes every
// path unit-testable from generated fixtures, and means the blind rule cannot
// be broken by importing this module.
//
// ==========================================================================
// WHAT IT REFUSES TO DO, which is most of its value
// ==========================================================================
// A migration adapter's failure mode is not crashing. It is emitting a
// plausible row that is WRONG - an appointment an hour off, a patient with no
// clinic, a status invented to make a row fit. Every such case here routes to
// `toReview` and is counted. Nothing is guessed into shape.

import { createHash } from "node:crypto";

import { normalizePhonePT } from "@osteojp/notify";

import type {
  MigrationAppointment,
  MigrationAttachment,
  MigrationClinicalEpisode,
  MigrationClinicalRecord,
  MigrationPatient,
  MigrationRecord,
} from "../types";
import type { FisiozeroSource, SourceRecord } from "../source";

/* ====================================================================== */
/* CSV                                                                     */
/* ====================================================================== */

/**
 * A real CSV state machine. A quoted field may carry the delimiter, a newline
 * and `""` for a literal quote.
 *
 * NOT `split(",")`, and the reason is specific to this delivery: `morada` and
 * `observacoes` are free text written by receptionists over a decade. A single
 * comma in an address silently shifts every later column by one, so `nif` reads
 * a fragment of a street name and `telefone` reads a postcode. Nothing throws.
 */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Delimiter from the header line, counting outside quotes.
 *
 * DETECTED RATHER THAN HARDCODED even though the probe reported comma for
 * `pacientes.csv`: the probe reported ONE file from ONE amostra, and the final
 * delivery is a separate extraction. A wrong delimiter yields one column, 100%
 * filled, and looks entirely healthy.
 */
export function detectDelimiter(text: string): string {
  const end = text.search(/\r\n|\r|\n/);
  const first = end === -1 ? text : text.slice(0, end);
  let commas = 0;
  let semis = 0;
  let quoted = false;
  for (let i = 0; i < first.length; i += 1) {
    const c = first[i]!;
    if (c === '"') {
      if (quoted && first[i + 1] === '"') i += 1;
      else quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (c === ",") commas += 1;
    else if (c === ";") semis += 1;
  }
  return semis > commas ? ";" : ",";
}

/** Header-keyed rows. A short row yields "" rather than undefined. */
function toObjects(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const stripped = text.replace(/^﻿/, "");
  const grid = parseCsv(stripped, detectDelimiter(stripped));
  if (grid.length === 0) return { headers: [], rows: [] };
  const headers = grid[0]!.map((h) => h.trim());
  const rows = grid.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => {
      o[h] = (r[i] ?? "").trim();
    });
    return o;
  });
  return { headers, rows };
}

/* ====================================================================== */
/* TIME - naive Europe/Lisbon wall clock to a real instant                 */
/* ====================================================================== */

export const DEFAULT_TIME_ZONE = "Europe/Lisbon";

/** The zone's offset, in ms, at a given instant. */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instantMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const hour = get("hour") === 24 ? 0 : get("hour");
  return (
    Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second")) -
    instantMs
  );
}

export type NaiveConversion =
  | { ok: true; iso: string; ambiguous: boolean }
  | { ok: false; reason: "unparseable" | "nonexistent_local_time" };

/**
 * `YYYY-MM-DD HH:MM:SS` in a zone's wall clock → an ISO instant.
 *
 * ==========================================================================
 * DST IS HANDLED IN BOTH DIRECTIONS, AND NEITHER IS HYPOTHETICAL IN LISBON
 * ==========================================================================
 * A naive local time is not a moment. Twice a year it is either NO moment or
 * TWO, and a decade of appointment history crosses those boundaries about
 * twenty times.
 *
 * NONEXISTENT (the March jump, 01:00 → 02:00): the wall time never occurred, so
 * there is no correct instant. Converting anyway - which every naive
 * implementation does, silently - invents one. It is refused and routed to
 * to_review.
 *
 * AMBIGUOUS (the October fallback, 01:00-01:59 happens twice): two instants are
 * equally valid. The EARLIER is taken, and the caller is TOLD it was a guess,
 * because a silent pick is indistinguishable from a certainty.
 *
 * THE METHOD: a candidate is correct only if formatting it back in the zone
 * reproduces the wall time we started from. Zero survivors means the gap, two
 * means the fold. That is a round-trip check rather than offset arithmetic, so
 * it cannot drift from what the platform's own Intl data says.
 */
export function naiveLocalToIso(naive: string, timeZone = DEFAULT_TIME_ZONE): NaiveConversion {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(naive.trim());
  if (!m) return { ok: false, reason: "unparseable" };
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number) as number[];
  const wall = Date.UTC(y!, mo! - 1, d!, h!, mi!, s!);

  // CANDIDATES ARE BUILT FROM OFFSETS ON BOTH SIDES OF THE DAY, not just from
  // the offset at the naive instant. Probing only around `wall` finds ONE
  // candidate in the autumn fold - the naive instant already sits past the
  // transition, so the pre-transition offset is never sampled and the second
  // valid moment is invisible, which makes an ambiguous time look certain. The
  // +-24h probes bracket any transition, so both offsets in play are seen.
  const DAY = 86_400_000;
  const guesses = new Set<number>();
  for (const probe of [wall - DAY, wall, wall + DAY]) {
    guesses.add(wall - zoneOffsetMs(probe, timeZone));
  }
  for (const g of [...guesses]) guesses.add(wall - zoneOffsetMs(g, timeZone));

  const valid = [...guesses].filter((c) => c + zoneOffsetMs(c, timeZone) === wall).sort((a, b) => a - b);
  if (valid.length === 0) return { ok: false, reason: "nonexistent_local_time" };
  return { ok: true, iso: new Date(valid[0]!).toISOString(), ambiguous: valid.length > 1 };
}

/* ====================================================================== */
/* ESTADO - a table, as data                                              */
/* ====================================================================== */

/**
 * The vendor's appointment state vocabulary → the platform's.
 *
 * DATA AND NOT CONSTANTS IN CODE, per the card, so the vendor confirming one
 * more value is an edit to this object rather than a change to a branch.
 *
 * `marcada` IS CONDITIONAL AND IS NOT IN THIS TABLE ALONE. A booking still
 * marked "marcada" whose start is in the PAST is not a scheduled appointment -
 * it is a row nobody ever closed out, and importing it as `scheduled` would put
 * a decade of dead bookings into reception's future diary.
 *
 * ==========================================================================
 * OWNER RULING B, 2026-08-25: A PAST-DATED `marcada` IS `cancelled`.
 * IT IS IMPORTED, NOT ROUTED TO REVIEW. THIS REVERSES THE EARLIER BEHAVIOUR.
 * ==========================================================================
 * Until this ruling those rows went to `toReview` with reason
 * `marcada_in_the_past`. That was the safe default while nobody had decided
 * what they MEAN, and it is now the wrong one for a specific, countable reason:
 * the amostra's `marcada` rows are almost entirely historical, so the old rule
 * routed most of a decade's dead bookings into a review queue that a human
 * would then have to empty by hand, one row at a time, to reach the same answer
 * every time.
 *
 * `cancelled` IS THE HONEST STATUS AND NOT MERELY THE CONVENIENT ONE. The
 * appointment was booked and it did not happen: no `realizada`, no `falta`, and
 * a start time long past. That is what `cancelled` means in
 * `appointment_status`, and it keeps the row in the patient's history where the
 * clinic can see it - which routing to review never did.
 *
 * IT IS STILL COUNTED, and that is what stops the ruling hiding anything.
 * `checks.pastMarcadaCancelled` reports how many rows took this path, so the
 * number is on the run's face instead of being absorbed into a status. A ruling
 * that makes rows silently change meaning is a ruling nobody can audit.
 *
 * NOTHING MAPS TO `confirmed`, DELIBERATELY. Confirmation in this platform
 * means a patient answered a reminder we sent. No Fisiozero row can evidence
 * that, and asserting it would fabricate a patient's action. A test pins it.
 */
export const ESTADO_MAP: Readonly<Record<string, MigrationAppointment["status"]>> = Object.freeze({
  realizada: "completed",
  falta: "no_show",
  marcada: "scheduled",
});

/**
 * `pastDatedMarcada` rides on the SUCCESS branch because, after ruling B, the
 * row IMPORTS - it is not a refusal any more. The flag exists so the caller can
 * count it; nothing branches on it.
 */
export type EstadoDecision =
  | { ok: true; status: MigrationAppointment["status"]; pastDatedMarcada?: boolean }
  | { ok: false; reason: "unknown_estado" };

export function mapEstado(estado: string, startsAtIso: string, now: Date): EstadoDecision {
  const key = estado.trim().toLowerCase();
  const mapped = ESTADO_MAP[key];
  if (!mapped) return { ok: false, reason: "unknown_estado" };
  if (key === "marcada" && new Date(startsAtIso).getTime() <= now.getTime()) {
    // OWNER RULING B. Imported as cancelled, counted, never reviewed.
    return { ok: true, status: "cancelled", pastDatedMarcada: true };
  }
  return { ok: true, status: mapped };
}

/* ====================================================================== */
/* SYNTHETIC IDS                                                          */
/* ====================================================================== */

/**
 * 128 bits of sha256, hex.
 *
 * DETERMINISM IS THE WHOLE REQUIREMENT: the staging ledger keys idempotency on
 * (tenant, source_system, entity_type, source_id), so a re-run must produce
 * byte-identical ids or it imports everything twice. Nothing here reads a
 * clock, a counter or a row order.
 */
export const synthId = (...parts: string[]): string =>
  createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);

/** `marcacoes.csv` has no id. */
export const appointmentSourceId = (idPaciente: string, inicio: string, terapeuta: string): string =>
  synthId(idPaciente, inicio, terapeuta);

/** Episode files have no id. Specialty comes from the filename. */
export const episodeSourceId = (idPaciente: string, dataAvaliacao: string, specialty: string): string =>
  synthId(idPaciente, dataAvaliacao, specialty);

/** `Episodios_Osteopatia.csv` → `Osteopatia`. */
export function specialtyFromFileName(fileName: string): string {
  const base = fileName.split("/").pop() ?? fileName;
  const m = /^Episodios[_-](.+)\.csv$/i.exec(base);
  return (m?.[1] ?? base.replace(/\.csv$/i, "")).trim();
}

/* ====================================================================== */
/* NORMALISATION AT THE MIGRATION BOUNDARY                                */
/* ====================================================================== */

/**
 * `sexo` -> the canonical value, per docs/migration-notes.md 2026-07-01:
 * "normalize sex to canonical values... F/feminino/Feminino/f -> female,
 * M/masculino/Masculino/m -> male. Fix at the migration boundary."
 *
 * `patients.sex` is `varchar(16)` and NOT an enum, so the database would accept
 * a raw "F" without complaint - which is exactly why this has to be done here.
 * An unrecognised value returns null and the row goes to to_review rather than
 * being guessed into one bucket or the other.
 */
export const SEX_MAP: Readonly<Record<string, string>> = Object.freeze({
  f: "female",
  feminino: "female",
  female: "female",
  m: "male",
  masculino: "male",
  male: "male",
});

export function normalizeSex(raw: string): string | null {
  return SEX_MAP[raw.trim().toLowerCase()] ?? null;
}

export type PhoneNormalisation = {
  /** E.164, or null when NO supplied number resolves. */
  phone: string | null;
  /** Every additional number that parsed, E.164, in source order. */
  additional: string[];
  /** Raw entries that did not resolve. COUNT is what gets reported, never these. */
  unresolvedCount: number;
};

/**
 * The multi-number rule: FIRST VALID WINS, the remainder is preserved.
 *
 * The caderno v1.1 specifies multiple telephone numbers as SEMICOLON-SEPARATED
 * WITH THE PRINCIPAL ONE FIRST, so source order is meaningful and the first
 * entry that resolves is the one the patient is reached on.
 *
 * NOTHING IS DISCARDED. Numbers after the first are preserved by the caller into
 * `notes`, because a second number is often the only way to reach an elderly
 * patient and dropping it silently is exactly what migration-notes.md warns
 * against: "surface (not silently drop) rows that do not resolve".
 *
 * THE RULES ARE NOT RE-DERIVED HERE. `normalizePhonePT` is imported from
 * @osteojp/notify - the same function the OTP login, the reminder dispatch and
 * the guest booking use. That is the literal instruction from
 * docs/migration-notes.md 2026-07-07, and it only became possible when the
 * function moved out of apps/web into a package.
 */
export function normalizePhones(raw: string): PhoneNormalisation {
  const parts = raw.split(";").map((p) => p.trim()).filter((p) => p !== "");
  const resolved: string[] = [];
  let unresolvedCount = 0;
  for (const p of parts) {
    const e164 = normalizePhonePT(p);
    if (e164) {
      if (!resolved.includes(e164)) resolved.push(e164);
    } else unresolvedCount += 1;
  }
  return { phone: resolved[0] ?? null, additional: resolved.slice(1), unresolvedCount };
}

/**
 * `seguro_saude` and `numero_apolice` -> `patients.health_insurance_numbers`.
 *
 * THE TARGET IS A LIST, NOT TWO SCALARS. PL-23 (migration 0051) models health
 * insurance as `{ insurer, number }[]` because "a patient may hold more than one
 * (ADSE plus a private insurer is ordinary in PT)". The caderno specifies both
 * vendor columns as semicolon-separated IN MATCHING ORDER, so they zip.
 *
 * A MISMATCHED COUNT IS NOT SILENTLY PADDED. Pairing an insurer with the wrong
 * policy number is worse than recording neither, so the caller routes the row to
 * to_review instead.
 */
export function zipInsurance(seguro: string, apolice: string): { insurer: string | null; number: string }[] | "mismatched" {
  const insurers = seguro.split(";").map((v) => v.trim()).filter((v) => v !== "");
  const numbers = apolice.split(";").map((v) => v.trim()).filter((v) => v !== "");
  if (numbers.length === 0) return [];
  if (insurers.length > 0 && insurers.length !== numbers.length) return "mismatched";
  return numbers.map((number, i) => ({ insurer: insurers[i] ?? null, number }));
}

/* ====================================================================== */
/* OPTIONS                                                                */
/* ====================================================================== */

/**
 * How a row gets its clinic.
 *
 * NEITHER SHAPE IS HARDCODED, per the card, because the vendor has not
 * confirmed which one the delivery takes. A per-clinic export carries the
 * clinic in the FILENAME and not in any column; a single combined export
 * carries it in `clinica`. Choosing one now and discovering the other later
 * means re-deriving every patient's location after import, which the staging
 * ledger makes possible but nobody wants to do across 10,000 rows.
 */
export type FisiozeroLocationResolution =
  | { kind: "fixed"; locationKey: string }
  | { kind: "column"; column: string; locationKeyByValue: Record<string, string> };

export type FisiozeroAdapterOptions = {
  /** Tenant uuid, used only to build the destination storage prefix. */
  tenantId: string;
  location: FisiozeroLocationResolution;
  /** `terapeuta` free text → practitioner resolver key. */
  practitionerKeyByName?: Record<string, string>;
  /** `tipo_servico` free text → service resolver key. Unmapped is allowed. */
  serviceKeyByType?: Record<string, string>;
  /** Injected so `marcada` is testable without faking the system clock. */
  now?: Date;
  timeZone?: string;
};

export type FisiozeroInput = {
  pacientes: string;
  marcacoes?: string;
  /** One entry per `Episodios_<Especialidade>.csv`. */
  episodios?: Array<{ fileName: string; csv: string }>;
  documentos?: string;
};

/**
 * A row the adapter refused to emit.
 *
 * CARRIES NO PERSONAL DATA. `file`, `row` and a reason CODE locate it precisely
 * enough for the owner to open the source row himself. `estado` and
 * `tipoServico` are the two exceptions and they are deliberate: both are
 * operational vocabulary rather than anything about a person, and an unknown
 * value is useless to report without saying which value it was.
 */
export type ToReviewRow = {
  file: string;
  row: number;
  reason: string;
  estado?: string;
  tipoServico?: string;
  /** The unmapped practitioner name. Operational metadata, ruled safe to print:
   *  a therapist's professional name as the vendor stored it is not a patient's
   *  data, and an unmapped-key report is useless without saying which key. */
  terapeuta?: string;
};

export type FisiozeroAdapterResult = {
  records: SourceRecord[];
  toReview: ToReviewRow[];
  warnings: string[];
  checks: {
    patients: number;
    appointments: number;
    episodes: number;
    clinicalRecords: number;
    attachments: number;
    /** Distinct `numero_paciente` collisions within this delivery. COUNT ONLY. */
    patientNumberDuplicates: number;
    /** Rows collapsed onto an existing synthetic id. */
    duplicateSyntheticAppointmentIds: number;
    duplicateSyntheticEpisodeIds: number;
    /** Attachment filenames seen more than once across all sources. */
    duplicateAttachmentFileNames: number;
    /** Instants that fell in the autumn fold and were resolved to the earlier. */
    ambiguousLocalTimes: number;
    /**
     * OWNER RULING B (2026-08-25): past-dated `marcada` rows imported as
     * `cancelled` rather than routed to review. A COUNT, so a ruling that
     * changes what a decade of rows mean stays auditable on the run's face.
     */
    pastMarcadaCancelled: number;
    /** Patients whose telefone resolved to NO valid PT number. COUNT ONLY. */
    unresolvablePhones: number;
    /** Patients whose data_criacao did not convert; created_at falls back to the default. */
    unparseableRegistrationDates: number;
    /** Unmapped operational keys, by value and occurrence count. Safe to print. */
    unmappedTerapeuta: Array<[string, number]>;
    unmappedTipoServico: Array<[string, number]>;
  };
};

/* ====================================================================== */
/* ADAPTER                                                                */
/* ====================================================================== */

const nonEmpty = (v: string | undefined): v is string => typeof v === "string" && v.trim() !== "";

/** Destination object path. The BYTE COPY is a separate job and not this one. */
export const attachmentStoragePath = (tenantId: string, fileName: string): string =>
  `${tenantId}/migration/fisiozero/${fileName}`;

export function adaptFisiozeroDelivery(
  input: FisiozeroInput,
  opts: FisiozeroAdapterOptions,
): FisiozeroAdapterResult {
  const tz = opts.timeZone ?? DEFAULT_TIME_ZONE;
  const now = opts.now ?? new Date();
  const records: SourceRecord[] = [];
  const toReview: ToReviewRow[] = [];
  const warnings: string[] = [];

  let ambiguousLocalTimes = 0;
  /** OWNER RULING B: past-dated `marcada` rows imported as `cancelled`. */
  let pastMarcadaCancelled = 0;
  // COUNTED BY VALUE so the runner can refuse an incomplete mapping and say
  // WHICH keys are missing and how much each one matters. One row is a typo;
  // four hundred is a real therapist whose whole diary would be skipped.
  // THE DAY-ONE LOGIN COUNT. Reported as a NUMBER and never as numbers:
  // LAUNCH-03 names this as the check that decides whether most of the patient
  // base can log in, and a phone is personal data.
  let unresolvablePhones = 0;
  /** data_criacao values that did not convert. COUNT ONLY - the patient still imports. */
  let unparseableRegistrationDates = 0;
  const unmappedTerapeuta = new Map<string, number>();
  const unmappedTipoServico = new Map<string, number>();
  const push = (entityType: SourceRecord["entityType"], sourceId: string, raw: unknown, record: MigrationRecord) =>
    records.push({ entityType, sourceId, raw, record });

  const locationKeyFor = (row: Record<string, string>): string | null => {
    if (opts.location.kind === "fixed") return opts.location.locationKey;
    const raw = row[opts.location.column];
    if (!nonEmpty(raw)) return null;
    return opts.location.locationKeyByValue[raw.trim()] ?? null;
  };

  /* ---- patients ---- */
  const pacientes = toObjects(input.pacientes);
  const knownPatientIds = new Set<string>();
  const numeroSeen = new Map<string, number>();

  pacientes.rows.forEach((row, i) => {
    const at = { file: "pacientes.csv", row: i + 2 };
    const sourceId = row["id_paciente"] ?? "";
    if (!nonEmpty(sourceId)) {
      toReview.push({ ...at, reason: "missing_id_paciente" });
      return;
    }
    if (knownPatientIds.has(sourceId)) {
      toReview.push({ ...at, reason: "duplicate_id_paciente" });
      return;
    }
    if (!nonEmpty(row["nome_completo"])) {
      toReview.push({ ...at, reason: "missing_nome_completo" });
      return;
    }

    // REQUIREMENT 5: no clinic, no patient. Routed, never emitted without one.
    const locationKey = locationKeyFor(row);
    if (!locationKey) {
      toReview.push({ ...at, reason: "unresolved_primary_location" });
      return;
    }

    knownPatientIds.add(sourceId);

    const numero = row["numero_paciente"];
    let patientNumber: number | null = null;
    if (nonEmpty(numero)) {
      const n = Number(numero.trim());
      if (Number.isInteger(n)) {
        patientNumber = n;
        numeroSeen.set(numero.trim(), (numeroSeen.get(numero.trim()) ?? 0) + 1);
      } else {
        warnings.push(`pacientes.csv row ${i + 2}: numero_paciente is not an integer; carried as null`);
      }
    }

    // SEX: unrecognised routes to review rather than being guessed into a
    // bucket. patients.sex is varchar(16), so the database would take "F".
    const rawSex = row["sexo"] ?? "";
    const sex = nonEmpty(rawSex) ? normalizeSex(rawSex) : null;
    if (nonEmpty(rawSex) && sex === null) {
      toReview.push({ ...at, reason: "unrecognised_sexo" });
      return;
    }

    // PHONE: first valid wins, the rest are preserved into notes. An
    // un-normalised number derives NULL in phone_e164 (migration 0062) and that
    // patient cannot log into the portal at all - LAUNCH-03's day-one check.
    const phones = normalizePhones(row["telefone"] ?? "");
    if (phones.phone === null && nonEmpty(row["telefone"])) unresolvablePhones += 1;

    const insurance = zipInsurance(row["seguro_saude"] ?? "", row["numero_apolice"] ?? "");
    if (insurance === "mismatched") {
      // Pairing an insurer with the wrong policy number is worse than
      // recording neither.
      toReview.push({ ...at, reason: "insurance_columns_mismatched" });
      return;
    }

    // REGISTRATION DATE, on vendor confirmation 2026-08-25 that `data_criacao`
    // is genuine and not an export stamp. Same naive-Lisbon conversion as every
    // other instant in this adapter: it arrives as `YYYY-MM-DD HH:MM:SS` with no
    // zone, so reading it as UTC would shift a decade of registrations by an
    // hour for half the year.
    //
    // AN UNPARSEABLE OR NONEXISTENT DATE DOES NOT SINK THE PATIENT. Unlike an
    // appointment, where a wrong instant is a wrong appointment, a registration
    // date is provenance: dropping the whole patient over it would be a far
    // larger loss than leaving created_at at its default. It is counted so the
    // number is visible rather than absorbed.
    let registeredAt: string | null = null;
    const rawCriacao = row["data_criacao"] ?? "";
    if (nonEmpty(rawCriacao)) {
      const conv = naiveLocalToIso(
        /^\d{4}-\d{2}-\d{2}$/.test(rawCriacao.trim()) ? `${rawCriacao.trim()} 00:00:00` : rawCriacao,
        tz,
      );
      if (conv.ok) {
        registeredAt = conv.iso;
        if (conv.ambiguous) ambiguousLocalTimes += 1;
      } else unparseableRegistrationDates += 1;
    }

    const carriedNotes = [
      nonEmpty(row["observacoes"]) ? row["observacoes"]!.trim() : null,
      phones.additional.length > 0 ? `Outros contactos: ${phones.additional.join(", ")}` : null,
    ].filter((v): v is string => v !== null);

    const patient: MigrationPatient = {
      sourceId,
      fullName: row["nome_completo"]!.trim(),
      dateOfBirth: nonEmpty(row["data_nascimento"]) ? row["data_nascimento"]!.trim() : null,
      sex,
      nif: nonEmpty(row["nif"]) ? row["nif"]!.trim() : null,
      email: nonEmpty(row["email"]) ? row["email"]!.trim() : null,
      phone: phones.phone,
      address: nonEmpty(row["morada"]) ? row["morada"]!.trim() : null,
      postalCode: nonEmpty(row["codigo_postal"]) ? row["codigo_postal"]!.trim() : null,
      city: nonEmpty(row["localidade"]) ? row["localidade"]!.trim() : null,
      notes: carriedNotes.length > 0 ? carriedNotes.join("\n") : null,
      locationKeys: [locationKey],
      primaryLocationKey: locationKey,
      patientNumber,
      healthInsuranceNumbers: insurance,
      registeredAt,
    };
    push("patient", sourceId, row, { entityType: "patient", data: patient });
  });

  const patientNumberDuplicates = [...numeroSeen.values()].filter((n) => n > 1).length;
  if (patientNumberDuplicates > 0) {
    warnings.push(
      `numero_paciente is NOT unique in this delivery: ${patientNumberDuplicates} value(s) repeat. ` +
        `patients.patient_number is tenant-unique, so these cannot all be carried.`,
    );
  }

  /* ---- attachments, deduplicated by filename across every source ---- */
  const attachmentByFileName = new Map<string, MigrationAttachment>();
  let duplicateAttachmentFileNames = 0;
  const addAttachment = (fileName: string, patientSourceId: string | null, extra: Partial<MigrationAttachment> = {}) => {
    const key = fileName.trim();
    if (!nonEmpty(key)) return;
    if (attachmentByFileName.has(key)) {
      duplicateAttachmentFileNames += 1;
      return;
    }
    attachmentByFileName.set(key, {
      sourceId: synthId("attachment", key),
      patientSourceId,
      storagePath: attachmentStoragePath(opts.tenantId, key),
      fileName: key,
      ...extra,
    });
  };

  pacientes.rows.forEach((row) => {
    if (nonEmpty(row["FICHEIRO"]) && nonEmpty(row["id_paciente"])) {
      addAttachment(row["FICHEIRO"]!, row["id_paciente"]!.trim());
    }
  });

  /* ---- appointments ---- */
  const seenAppointmentIds = new Set<string>();
  let duplicateSyntheticAppointmentIds = 0;
  if (input.marcacoes) {
    toObjects(input.marcacoes).rows.forEach((row, i) => {
      const at = { file: "marcacoes.csv", row: i + 2 };
      const patientSourceId = (row["id_paciente"] ?? "").trim();
      if (!knownPatientIds.has(patientSourceId)) {
        toReview.push({ ...at, reason: "orphan_id_paciente" });
        return;
      }
      const terapeuta = (row["terapeuta"] ?? "").trim();
      const practitionerKey = opts.practitionerKeyByName?.[terapeuta] ?? null;
      if (!practitionerKey) {
        toReview.push({ ...at, reason: "unresolved_terapeuta", terapeuta });
        unmappedTerapeuta.set(terapeuta, (unmappedTerapeuta.get(terapeuta) ?? 0) + 1);
        return;
      }
      const locationKey = locationKeyFor(row);
      if (!locationKey) {
        toReview.push({ ...at, reason: "unresolved_location" });
        return;
      }

      const start = naiveLocalToIso(row["inicio"] ?? "", tz);
      if (!start.ok) {
        toReview.push({ ...at, reason: `inicio_${start.reason}` });
        return;
      }
      const end = naiveLocalToIso(row["fim"] ?? "", tz);
      if (!end.ok) {
        toReview.push({ ...at, reason: `fim_${end.reason}` });
        return;
      }
      if (start.ambiguous || end.ambiguous) ambiguousLocalTimes += 1;
      if (new Date(end.iso).getTime() <= new Date(start.iso).getTime()) {
        toReview.push({ ...at, reason: "fim_not_after_inicio" });
        return;
      }

      const estadoRaw = (row["estado"] ?? "").trim();
      const decision = mapEstado(estadoRaw, start.iso, now);
      if (!decision.ok) {
        toReview.push({ ...at, reason: decision.reason, estado: estadoRaw });
        return;
      }
      // OWNER RULING B. The row imports as `cancelled`; the count is what keeps
      // the ruling auditable instead of silently rewriting a decade of statuses.
      if (decision.pastDatedMarcada) pastMarcadaCancelled += 1;

      const sourceId = appointmentSourceId(patientSourceId, (row["inicio"] ?? "").trim(), terapeuta);
      if (seenAppointmentIds.has(sourceId)) {
        duplicateSyntheticAppointmentIds += 1;
        return;
      }
      seenAppointmentIds.add(sourceId);

      const tipo = (row["tipo_servico"] ?? "").trim();
      const serviceKey = nonEmpty(tipo) ? (opts.serviceKeyByType?.[tipo] ?? null) : null;
      if (nonEmpty(tipo) && !serviceKey) {
        unmappedTipoServico.set(tipo, (unmappedTipoServico.get(tipo) ?? 0) + 1);
      }

      const appointment: MigrationAppointment = {
        sourceId,
        patientSourceId,
        practitionerKey,
        locationKey,
        serviceKey,
        startsAt: start.iso,
        endsAt: end.iso,
        status: decision.status,
        notes: nonEmpty(row["observacoes"]) ? row["observacoes"]!.trim() : null,
      };
      push("appointment", sourceId, row, { entityType: "appointment", data: appointment });
    });
  }

  /* ---- episodes + clinical records ---- */
  const NON_CLINICAL = new Set(["tipo", "id_paciente", "terapeuta", "data_avaliacao", "FICHEIRO"]);
  const seenEpisodeIds = new Set<string>();
  let duplicateSyntheticEpisodeIds = 0;
  let clinicalRecords = 0;

  for (const file of input.episodios ?? []) {
    const specialty = specialtyFromFileName(file.fileName);
    toObjects(file.csv).rows.forEach((row, i) => {
      const at = { file: file.fileName, row: i + 2 };
      const patientSourceId = (row["id_paciente"] ?? "").trim();
      if (!knownPatientIds.has(patientSourceId)) {
        toReview.push({ ...at, reason: "orphan_id_paciente" });
        return;
      }
      const dataAvaliacao = (row["data_avaliacao"] ?? "").trim();
      if (!nonEmpty(dataAvaliacao)) {
        toReview.push({ ...at, reason: "missing_data_avaliacao" });
        return;
      }
      const opened = naiveLocalToIso(
        /^\d{4}-\d{2}-\d{2}$/.test(dataAvaliacao) ? `${dataAvaliacao} 00:00:00` : dataAvaliacao,
        tz,
      );
      if (!opened.ok) {
        toReview.push({ ...at, reason: `data_avaliacao_${opened.reason}` });
        return;
      }
      if (opened.ambiguous) ambiguousLocalTimes += 1;

      const sourceId = episodeSourceId(patientSourceId, dataAvaliacao, specialty);
      if (seenEpisodeIds.has(sourceId)) {
        duplicateSyntheticEpisodeIds += 1;
        return;
      }
      seenEpisodeIds.add(sourceId);

      const practitionerKey =
        opts.practitionerKeyByName?.[(row["terapeuta"] ?? "").trim()] ?? null;

      // The caderno's instruction for a vendor with no episode concept: one
      // episode per clinical record, closed.
      const episode: MigrationClinicalEpisode = {
        sourceId,
        patientSourceId,
        practitionerKey,
        title: specialty,
        status: "closed",
        openedAt: opened.iso,
        closedAt: opened.iso,
      };
      push("clinical_episode", sourceId, row, { entityType: "clinical_episode", data: episode });

      // REQUIREMENT 8: specialty fields fold into `data` under THEIR OWN NAMES.
      // Renaming them into a house vocabulary would be a clinical judgement -
      // `queixas` and `motivos` are not obviously the same field - and this
      // adapter is not entitled to make one. Empty fields are omitted so an
      // absent value never reads as an answered one.
      const data: Record<string, unknown> = { especialidade: specialty };
      for (const [k, v] of Object.entries(row)) {
        if (NON_CLINICAL.has(k) || k === "escala_eva") continue;
        if (nonEmpty(v)) data[k] = v.trim();
      }
      // ZERO IS A VALID PAIN SCORE, so this is included whenever the column
      // holds a number - never treated as absent because it is falsy. Omitting
      // a recorded 0 would turn "no pain" into "not asked".
      const eva = (row["escala_eva"] ?? "").trim();
      if (eva !== "" && Number.isFinite(Number(eva))) data["escala_eva"] = Number(eva);

      const record: MigrationClinicalRecord = {
        sourceId,
        patientSourceId,
        episodeSourceId: sourceId,
        practitionerKey,
        data,
        status: "locked",
        recordedAt: opened.iso,
      };
      push("clinical_record", sourceId, row, { entityType: "clinical_record", data: record });
      clinicalRecords += 1;

      if (nonEmpty(row["FICHEIRO"])) addAttachment(row["FICHEIRO"]!, patientSourceId, { clinicalRecordSourceId: sourceId });
    });
  }

  /* ---- documentos.csv ---- */
  if (input.documentos) {
    toObjects(input.documentos).rows.forEach((row, i) => {
      const at = { file: "documentos.csv", row: i + 2 };
      const fileName = (row["ficheiro"] ?? "").trim();
      if (!nonEmpty(fileName)) {
        toReview.push({ ...at, reason: "missing_ficheiro" });
        return;
      }
      const patientSourceId = (row["id_paciente"] ?? "").trim();
      if (!knownPatientIds.has(patientSourceId)) {
        toReview.push({ ...at, reason: "orphan_id_paciente" });
        return;
      }
      // documentos.csv is the RICHEST source for an attachment, so it wins on a
      // filename already seen from a FICHEIRO column: it is the only one
      // carrying the mime type and the original name.
      const existing = attachmentByFileName.get(fileName);
      if (existing && existing.mimeType == null) attachmentByFileName.delete(fileName);
      else if (existing) {
        duplicateAttachmentFileNames += 1;
        return;
      }
      attachmentByFileName.set(fileName, {
        sourceId: (row["id_documento"] ?? "").trim() || synthId("attachment", fileName),
        patientSourceId,
        storagePath: attachmentStoragePath(opts.tenantId, fileName),
        fileName: nonEmpty(row["nome_original"]) ? row["nome_original"]!.trim() : fileName,
        mimeType: nonEmpty(row["tipo_mime"]) ? row["tipo_mime"]!.trim() : null,
      });
    });
  }

  for (const [, a] of attachmentByFileName) {
    push("attachment", a.sourceId, { fileName: a.fileName }, { entityType: "attachment", data: a });
  }

  if (ambiguousLocalTimes > 0) {
    warnings.push(
      `${ambiguousLocalTimes} instant(s) fell in the autumn DST fold and were resolved to the EARLIER of two ` +
        `equally valid moments. Each is a guess, not a reading.`,
    );
  }

  if (pastMarcadaCancelled > 0) {
    warnings.push(
      `${pastMarcadaCancelled} appointment(s) were still "marcada" with a start in the PAST and were ` +
        `imported as CANCELLED (owner ruling B, 2026-08-25). They are in the patient's history, not in the diary.`,
    );
  }

  return {
    records,
    toReview,
    warnings,
    checks: {
      patients: records.filter((r) => r.entityType === "patient").length,
      appointments: records.filter((r) => r.entityType === "appointment").length,
      episodes: records.filter((r) => r.entityType === "clinical_episode").length,
      clinicalRecords,
      attachments: attachmentByFileName.size,
      patientNumberDuplicates,
      duplicateSyntheticAppointmentIds,
      duplicateSyntheticEpisodeIds,
      duplicateAttachmentFileNames,
      ambiguousLocalTimes,
      pastMarcadaCancelled,
      unresolvablePhones,
      unparseableRegistrationDates,
      unmappedTerapeuta: [...unmappedTerapeuta.entries()].sort((a, b) => b[1] - a[1]),
      unmappedTipoServico: [...unmappedTipoServico.entries()].sort((a, b) => b[1] - a[1]),
    },
  };
}

/** The adapter behind the `FisiozeroSource` seam in ../source.ts. */
export function createFisiozeroSource(
  input: FisiozeroInput,
  opts: FisiozeroAdapterOptions,
): FisiozeroSource & { result: FisiozeroAdapterResult } {
  const result = adaptFisiozeroDelivery(input, opts);
  return {
    sourceSystem: "fisiozero",
    result,
    async *records() {
      for (const r of result.records) yield r;
    },
  };
}
