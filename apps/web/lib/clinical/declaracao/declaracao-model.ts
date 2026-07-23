import "server-only";

import {
  normalizeLocationKey,
  resolveLocationContact,
  type SourceLocation,
} from "../report/location-contacts";
import { readDeclaracaoSettings } from "./declaracao-settings";
import { signatureStampBytesForLocation } from "./signature-stamp-asset";

// W5-31 — pure, testable projection for the Declaração de Presença PDF. The
// orchestrator (generate.ts) resolves the raw inputs (patient, appointment
// times, location, tenant settings) and hands this builder already-formatted
// display strings; the builder decides the localidade, the responsável, and
// whether the signature/stamp image is embedded.

/**
 * Localidade for the "{localidade}, {dia}" line: the selected marcação's location
 * locality (Linda-a-Velha / Castelo Branco, from the canonical location-contacts
 * dataset), falling back to the tenant's default location, then to the location
 * NAME. Never a fixed "Lisboa".
 */
export function resolveLocalidade(
  appointmentLocation: SourceLocation | null,
  tenantDefaultLocation: SourceLocation | null,
): string {
  for (const loc of [appointmentLocation, tenantDefaultLocation]) {
    if (!loc) continue;
    const city = resolveLocationContact(loc).city;
    if (city && city.trim().length > 0) return city.trim();
  }
  return (appointmentLocation?.name ?? tenantDefaultLocation?.name ?? "").trim();
}

/**
 * The location key the CARIMBO resolves through (W9-03, CB QA item 2).
 *
 * Deliberately mirrors `resolveLocalidade` above: same two candidates, same
 * order (the marcação's location, then the tenant default), same canonical
 * `normalizeLocationKey`. The localidade line and the stamp therefore always
 * describe the SAME clinic - a CB declaration cannot say "Castelo Branco" and
 * carry the LV carimbo, which is precisely the reported defect.
 *
 * Returns null when neither location is known, which resolves to a blank stamp
 * area rather than a fallback to some other clinic's stamp.
 */
export function resolveStampLocationKey(
  appointmentLocation: SourceLocation | null,
  tenantDefaultLocation: SourceLocation | null,
): string | null {
  for (const loc of [appointmentLocation, tenantDefaultLocation]) {
    if (!loc?.name) continue;
    const key = normalizeLocationKey(loc.name);
    if (key) return key;
  }
  return null;
}

export type DeclaracaoInputs = {
  patientName: string;
  /** Pre-formatted Europe/Lisbon date, e.g. "12/07/2026". */
  dia: string;
  /** Pre-formatted Europe/Lisbon start time, e.g. "09:30". */
  horaInicio: string;
  /** Pre-formatted Europe/Lisbon end time, e.g. "10:30". */
  horaFim: string;
  localidade: string;
  /** W9-03: canonical key of the clinic this declaration is FOR, from
   *  resolveStampLocationKey. Drives per-location carimbo resolution; null ->
   *  blank stamp area. */
  stampLocationKey: string | null;
  /** W12-24: the patient NIF as entered in the dialog (prefilled from
   *  `patients.nif`, editable). Trimmed; null/empty -> omitted from the body. */
  nif?: string | null;
  /** The tenant's raw `settings` JSONB (declaracao namespace read here). */
  tenantSettings: unknown;
};

export type DeclaracaoModel = {
  patientName: string;
  dia: string;
  horaInicio: string;
  horaFim: string;
  localidade: string;
  responsavel: string;
  /** W12-24: patient NIF, or null when not provided (omitted from the body). */
  nif: string | null;
  /** The owner-supplied signature + carimbo image FOR THIS LOCATION, or null
   *  -> blank stamp space (W9-03). Never another location's stamp. */
  stampBytes: Uint8Array | null;
};

export function buildDeclaracaoModel(inputs: DeclaracaoInputs): DeclaracaoModel {
  const settings = readDeclaracaoSettings(inputs.tenantSettings);
  return {
    patientName: inputs.patientName,
    dia: inputs.dia,
    horaInicio: inputs.horaInicio,
    horaFim: inputs.horaFim,
    localidade: inputs.localidade,
    responsavel: settings.responsavel,
    // W12-24: carry the (trimmed) NIF, or null so the body omits it entirely.
    nif: inputs.nif?.trim() || null,
    // W9-03: per-location. The tenant switch still wins (settings.signatureStamp
    // = false means "leave blank for a physical stamp" everywhere); when it is
    // on, the stamp is resolved for THIS declaration's location, and a location
    // with no asset yet gets a blank area - never another clinic's carimbo.
    stampBytes: settings.signatureStamp
      ? signatureStampBytesForLocation(inputs.stampLocationKey)
      : null,
  };
}
