import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";

/**
 * WHAT A HARD DELETE WOULD DESTROY, AND WHAT IS STILL REFUSING IT.
 *
 * ==========================================================================
 * WHY THIS EXISTS
 * ==========================================================================
 * The clinic reported that a patient carrying a note cannot be deleted, and
 * could not tell WHY: `hardDeletePatient` counts TEN reference classes, sums
 * them, and returns one word - `has_references` - for all ten. The screen then
 * rendered one sentence for that word. So an operator facing an undeletable
 * patient learned that something referenced them and never which thing, and the
 * difference matters enormously: three appointments are a thing you can act on,
 * a single note in an append-only table is not.
 *
 * This module turns the sum back into its terms. Pure and framework-free so the
 * wording and the classification are unit-testable without a database - the DB
 * read lives in ./queries.ts, exactly as ./scope.ts and ./nif.ts are split.
 *
 * ==========================================================================
 * NOTHING CASCADES YET, AND THAT IS DELIBERATE
 * ==========================================================================
 * Migration 0084 gives both note relations a DELETE policy, which is what a
 * cascade needs; it is authored and NOT APPLIED. Until it is, EVERY class here
 * is a blocker, and this module says so rather than promising a cascade the
 * database would refuse. A screen that lists what it is "about to destroy"
 * while the delete still fails is the unknown case rendered as the known one -
 * PORTAL-REHYDRATE 1.3 - and it would be a worse defect than the one being
 * fixed, because it would look like it worked.
 *
 * `CASCADES` is therefore EMPTY and the split is already expressed, so the
 * follow-up PR moves two strings into it and changes nothing else.
 */

const s = getStrings(DEFAULT_LOCALE);

/** The ten classes `hardDeletePatient` counts, in the order it counts them. */
export const HARD_DELETE_CLASSES = [
  "clinicalRecords",
  "clinicalEpisodes",
  "appointments",
  "appointmentNotes",
  "patientNoteRevisions",
  "invoices",
  "attachments",
  "formSubmissions",
  "analyticsEvents",
  "mergeLosers",
] as const;

export type HardDeleteClass = (typeof HARD_DELETE_CLASSES)[number];

/** One class and how many rows of it point at this patient. */
export type HardDeleteCount = { key: HardDeleteClass; count: number };

/**
 * Classes a hard delete would REMOVE rather than refuse.
 *
 * EMPTY UNTIL 0084 IS APPLIED. `appointmentNotes` and `patientNoteRevisions`
 * belong here the moment their DELETE policies exist; today an authenticated
 * DELETE on either resolves to zero rows, so listing them as cascading would be
 * a claim the database contradicts.
 */
export const CASCADES: readonly HardDeleteClass[] = [];

/**
 * `clinical_records` is refused SEPARATELY and permanently: a locked or signed
 * record can never be removed (the immutability trigger, hard rule 4), and
 * `hardDeletePatient` checks it FIRST and alone so the caller gets the precise
 * "permanently blocked" signal rather than the generic one.
 */
export const PERMANENT: readonly HardDeleteClass[] = ["clinicalRecords"];

const LABEL: Record<HardDeleteClass, keyof typeof s> = {
  clinicalRecords: "patients.hardDeleteClassRecords",
  clinicalEpisodes: "patients.hardDeleteClassEpisodes",
  appointments: "patients.hardDeleteClassAppointments",
  appointmentNotes: "patients.hardDeleteClassNotes",
  patientNoteRevisions: "patients.hardDeleteClassNoteRevisions",
  invoices: "patients.hardDeleteClassInvoices",
  attachments: "patients.hardDeleteClassAttachments",
  formSubmissions: "patients.hardDeleteClassFormSubmissions",
  analyticsEvents: "patients.hardDeleteClassAnalytics",
  mergeLosers: "patients.hardDeleteClassMergeLosers",
};

/** The pt-PT name of a class, for the danger-zone list. */
export function classLabel(key: HardDeleteClass): string {
  return s[LABEL[key]];
}

/** Only the classes that actually have rows. Input order is preserved. */
export function presentCounts(counts: readonly HardDeleteCount[]): HardDeleteCount[] {
  return counts.filter((c) => c.count > 0);
}

/** The present classes a delete would DESTROY. Empty until 0084 is applied. */
export function cascadingCounts(counts: readonly HardDeleteCount[]): HardDeleteCount[] {
  return presentCounts(counts).filter((c) => CASCADES.includes(c.key));
}

/** The present classes that REFUSE the delete. */
export function blockingCounts(counts: readonly HardDeleteCount[]): HardDeleteCount[] {
  return presentCounts(counts).filter((c) => !CASCADES.includes(c.key));
}

/**
 * Is the delete refused, and is the refusal permanent?
 *
 * `permanent` is not a severity label: a clinical record can NEVER be removed,
 * so no amount of tidying makes that patient deletable, while appointments and
 * invoices are refusals somebody could in principle resolve. Telling an operator
 * to go and clear something that can never be cleared wastes their afternoon.
 */
export function refusal(counts: readonly HardDeleteCount[]): {
  blocked: boolean;
  permanent: boolean;
} {
  const blocking = blockingCounts(counts);
  return {
    blocked: blocking.length > 0,
    permanent: blocking.some((c) => PERMANENT.includes(c.key)),
  };
}
