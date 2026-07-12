import "server-only";

import { resolveLocationContact, type SourceLocation } from "../report/location-contacts";
import { readDeclaracaoSettings } from "./declaracao-settings";
import { signatureStampBytes } from "./signature-stamp-asset";

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

export type DeclaracaoInputs = {
  patientName: string;
  /** Pre-formatted Europe/Lisbon date, e.g. "12/07/2026". */
  dia: string;
  /** Pre-formatted Europe/Lisbon start time, e.g. "09:30". */
  horaInicio: string;
  /** Pre-formatted Europe/Lisbon end time, e.g. "10:30". */
  horaFim: string;
  localidade: string;
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
  /** The owner-supplied signature + carimbo image, or null → blank stamp space. */
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
    stampBytes: settings.signatureStamp ? signatureStampBytes() : null,
  };
}
