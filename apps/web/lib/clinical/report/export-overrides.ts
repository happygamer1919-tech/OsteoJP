/**
 * RODICA-export-edit-before-download: THE DATE, THE HOUR AND THE HEADING OF AN
 * EXPORTED REGISTO, CHANGED FOR THE FILE ONLY.
 *
 * Owner ruling, 2026-11-02 (docs/DECISIONS.md): "do it exactly as requested
 * ... it's a request from Rodica and I made her aware it will be her
 * responsibility". Before a ficha, an episode or an imported group is
 * exported, the dialog asks whether each registo keeps the appointment's date
 * and hour and its "Conteúdo importado" heading, or prints others.
 *
 * PURE: no database, no server import, no PDF library, so the rules are
 * unit-tested as statements. What this file decides:
 *
 *   parseExportOverrides   what the dialog sent, checked value by value. The
 *                          server never trusts it: a bad date, a bad hour, a
 *                          long or multi-line text, a repeated registo, or
 *                          anything that is not that shape refuses the export.
 *   overridesWithin        every registo named is one the export holds. The
 *                          export's registos are the server's own read, never
 *                          the dialog's list.
 *   exportDefaults         what a registo prints when nothing is changed: the
 *                          appointment's Lisbon date and hour (the record's
 *                          creation date and no hour when it has no
 *                          appointment), and the heading its stored view draws.
 *   overrideAuditEntry     what the audit row says about one registo, or null
 *                          when the dialog changed nothing on it.
 *
 * EXPORT-ONLY. Nothing here, nor anywhere in the export, writes the registo:
 * a locked or signed registo cannot be changed (the immutability trigger), and
 * the change is a property of one file, recorded in that file's audit row.
 */
import { getStrings, type Locale } from "@osteojp/i18n";
import type { RecordView } from "../record-view";

/** The longest heading text the dialog may send. A heading, not a paragraph. */
export const EXPORT_TEXT_MAX = 200;

/** More registos than any patient's file holds; a list longer than this is refused unread. */
export const EXPORT_OVERRIDES_MAX = 1000;

/** One registo's values for one file, as the dialog sends them. */
export type ExportOverride = {
  recordId: string;
  /** "YYYY-MM-DD", the date printed as "Data da consulta". */
  date: string;
  /** "HH:MM" (24h), or "" for no hour. */
  time: string;
  /** The heading text; "" prints no heading. */
  text: string;
};

/** What a registo prints when nothing is changed. Same shape as an override's values. */
export type ExportDefaults = { date: string; time: string; text: string };

/** One row of the dialog: a registo of the export and its defaults. */
export type ExportRow = ExportDefaults & {
  recordId: string;
  /** The section the registo sits under in the whole-patient file; null elsewhere. */
  group: string | null;
  version: number;
};

/** What the audit row records about one registo whose values were changed. */
export type OverrideAuditEntry = {
  recordId: string;
  originalDate: string;
  /** null: the registo has no appointment hour. */
  originalTime: string | null;
  exportedDate: string;
  /** null: the file prints no hour. */
  exportedTime: string | null;
  textChanged: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** True when `text` holds a line break, a tab or any other control character. */
function hasControl(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** A real calendar date, "YYYY-MM-DD", between 1900 and 2100. */
export function isExportDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2100) return false;
  const at = new Date(Date.UTC(y, mo - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === mo - 1 && at.getUTCDate() === d;
}

/** "HH:MM" on a 24-hour clock, or "" for no hour. */
export function isExportTime(value: unknown): value is string {
  return typeof value === "string" && (value === "" || TIME_RE.test(value));
}

/** One line of at most EXPORT_TEXT_MAX characters. */
export function isExportText(value: unknown): value is string {
  return typeof value === "string" && value.length <= EXPORT_TEXT_MAX && !hasControl(value);
}

/**
 * What the dialog sent, checked. `undefined` and `null` are "keep the
 * appointment's details" and give no override. Anything else must be a list
 * of `{ recordId, date, time, text }`, each value valid and each registo named
 * once, or the answer is null and the export is refused. Text is trimmed; a
 * registo id is lower-cased, as the database spells it.
 */
export function parseExportOverrides(raw: unknown): ExportOverride[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > EXPORT_OVERRIDES_MAX) return null;
  const seen = new Set<string>();
  const out: ExportOverride[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
    const { recordId, date, time, text } = item as Record<string, unknown>;
    if (typeof recordId !== "string" || !UUID_RE.test(recordId)) return null;
    if (!isExportDate(date) || !isExportTime(time) || !isExportText(text)) return null;
    const id = recordId.toLowerCase();
    if (seen.has(id)) return null;
    seen.add(id);
    out.push({ recordId: id, date, time, text: text.trim() });
  }
  return out;
}

/** True when every registo the overrides name is one of `recordIds` (the export's own). */
export function overridesWithin(overrides: readonly ExportOverride[], recordIds: readonly string[]): boolean {
  const held = new Set(recordIds.map((id) => id.toLowerCase()));
  return overrides.every((o) => held.has(o.recordId));
}

/** The overrides keyed by registo id, as the renderers look them up. */
export function overridesByRecord(overrides: readonly ExportOverride[]): Map<string, ExportOverride> {
  return new Map(overrides.map((o) => [o.recordId, o]));
}

/** The Lisbon calendar date of an instant, "YYYY-MM-DD". */
export function lisbonDateKey(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** The Lisbon wall-clock time of an instant, "HH:MM", 24-hour. */
export function lisbonTimeKey(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}

/**
 * The heading a registo's PDF draws above its content, in `locale`: the
 * registo page's own title for a stored view ("Conteúdo importado" for an
 * imported registo), and none for a registo with a form.
 */
export function defaultHeadingText(view: RecordView, locale: Locale): string {
  if (view === "form") return "";
  const s = getStrings(locale);
  return view === "imported" ? s["clinical.importedPreviewTitle"] : s["clinical.recordContentTitle"];
}

/**
 * What a registo prints when nothing is changed. The date is the one the PDF
 * prints as "Data da consulta" (the appointment's start, else the record's
 * creation). The hour is the APPOINTMENT's only: a registo with no appointment
 * has no consultation hour, and its creation time is not one.
 */
export function exportDefaults(
  record: { consultationDate: Date | null; appointmentStartsAt?: Date | null; view: RecordView },
  locale: Locale,
): ExportDefaults | null {
  if (!record.consultationDate) return null;
  return {
    date: lisbonDateKey(record.consultationDate),
    time: record.appointmentStartsAt ? lisbonTimeKey(record.appointmentStartsAt) : "",
    text: defaultHeadingText(record.view, locale),
  };
}

/**
 * What the audit row says about one registo: its id, the date and hour it
 * would have printed, the ones it printed, and whether the heading text
 * differs. Null when the override changes nothing, and then the file prints
 * the registo exactly as it would with no override.
 */
export function overrideAuditEntry(
  recordId: string,
  defaults: ExportDefaults,
  override: ExportOverride | undefined,
): OverrideAuditEntry | null {
  if (!override) return null;
  const textChanged = override.text !== defaults.text;
  if (override.date === defaults.date && override.time === defaults.time && !textChanged) return null;
  return {
    recordId,
    originalDate: defaults.date,
    originalTime: defaults.time === "" ? null : defaults.time,
    exportedDate: override.date,
    exportedTime: override.time === "" ? null : override.time,
    textChanged,
  };
}

/**
 * The audit metadata an export adds when at least one registo was changed,
 * and nothing otherwise: an export with no change writes the row it always
 * wrote. Ids, ISO dates, "HH:MM" and booleans only: `writeClinicalAudit`
 * refuses free text, and the heading text itself is never written.
 */
export function overrideAuditMetadata(
  entries: readonly OverrideAuditEntry[] | undefined,
): { overridesApplied: true; overrides: OverrideAuditEntry[] } | Record<string, never> {
  if (!entries || entries.length === 0) return {};
  return { overridesApplied: true, overrides: entries.map((e) => ({ ...e })) };
}
