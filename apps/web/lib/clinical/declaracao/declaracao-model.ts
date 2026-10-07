import "server-only";

import {
  resolveLocationContact,
  type LocationContact,
  type SourceLocation,
} from "../report/location-contacts";
import {
  resolveClinicFiscal,
  type ClinicFiscal,
  type ClinicFiscalSource,
} from "../report/clinic-fiscal";
import { readDeclaracaoSettings } from "./declaracao-settings";
import { signatureStampBytesForLocation } from "./signature-stamp-asset";
import { resolveStampClinicKey, stampClinicCity } from "./stamp-clinic";

// W5-31 — pure, testable projection for the Declaração de Presença PDF. The
// orchestrator (generate.ts) resolves the raw inputs (patient, appointment
// times, location, tenant settings) and hands this builder already-formatted
// display strings; the builder decides the localidade, the responsável, and
// whether the signature/stamp image is embedded.

/**
 * Localidade for the "{localidade}, {dia}" line: the city of the clinic the
 * declaration's location is (Linda-a-Velha / Castelo Branco), whichever way that
 * location is spelled, "Linda-a-Velha" or "OsteoJP (LV)". A location that is
 * not one of those clinics gives its own NAME. Never a fixed "Lisboa".
 *
 * R45: resolved through `resolveStampClinicKey`, the resolver the carimbo uses,
 * on the ONE location the declaration is for. The line and the stamp therefore
 * always describe the SAME clinic, and neither has a second location to fall
 * back to.
 */
export function resolveLocalidade(location: SourceLocation | null): string {
  if (!location) return "";
  const key = resolveStampClinicKey(location.name);
  return (key && stampClinicCity(key)) || location.name.trim();
}

/**
 * The clinic key the CARIMBO resolves through (W9-03, CB QA item 2), for the
 * location the declaration is for.
 *
 * R45: the key comes from `resolveStampClinicKey`, so it is only ever the key
 * of a clinic that HAS a carimbo asset. Null is every other case: a location
 * with no asset, a name that is not one of the clinics, and no location at
 * all. generate.ts refuses the declaration on null; nothing falls back to some
 * other clinic's stamp.
 */
export function resolveStampLocationKey(location: SourceLocation | null): string | null {
  return resolveStampClinicKey(location?.name);
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
   *  blank stamp area. R45: generate.ts refuses a null key before it builds a
   *  model, so a rendered declaration always arrives here with a clinic's key. */
  stampLocationKey: string | null;
  /** W12-24: the patient NIF as entered in the dialog (prefilled from
   *  `patients.nif`, editable). Trimmed; null/empty -> omitted from the body. */
  nif?: string | null;
  /** PL-03a: optional free-text observações typed in the dialog before
   *  generation. Trimmed; null/empty -> the body has no observações block.
   *  Transient (never persisted). */
  observacoes?: string | null;
  /** W12-30 C1: the location this declaration is FOR, the one the request
   *  named, resolved to the print-ready contact block for the branded footer.
   *  null -> no contact block (the fiscal identity still prints). */
  sourceLocation?: SourceLocation | null;
  /** W12-30 C1: clinic fiscal identity source (tenants.name / tenants.nif),
   *  resolved via resolveClinicFiscal into the footer fiscal line. Falls back to
   *  the owner-gated placeholders when absent (never invents values). */
  fiscalSource?: ClinicFiscalSource;
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
  /** PL-03a: trimmed free-text observações, or null -> no observações block. */
  observacoes: string | null;
  /** The owner-supplied signature + carimbo image FOR THIS LOCATION, or null
   *  -> blank stamp space (W9-03). Never another location's stamp. */
  stampBytes: Uint8Array | null;
  /** W12-30 C1: print-ready location contact block for the branded footer, or
   *  null when the source location is unknown. */
  contact: LocationContact | null;
  /** W12-30 C1: resolved clinic fiscal identity (name + NIF) for the footer;
   *  owner-gated placeholders when the tenant carries none. */
  fiscal: ClinicFiscal;
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
    // PL-03a: carry the (trimmed) observações, or null so the body has no block.
    observacoes: inputs.observacoes?.trim() || null,
    // W9-03: per-location. The tenant switch still wins (settings.signatureStamp
    // = false means "leave blank for a physical stamp" everywhere); when it is
    // on, the stamp is resolved for THIS declaration's location - never another
    // clinic's carimbo. R45: the switch only blanks the area of a clinic that
    // has a carimbo; a location with none is refused in generate.ts whatever
    // the switch says.
    stampBytes: settings.signatureStamp
      ? signatureStampBytesForLocation(inputs.stampLocationKey)
      : null,
    // W12-30 C1: branded-footer sources — reuse the report/RGPD data helpers, so
    // the three printed documents draw contacts + fiscal identity from one place.
    contact: inputs.sourceLocation ? resolveLocationContact(inputs.sourceLocation) : null,
    fiscal: resolveClinicFiscal(inputs.fiscalSource ?? { tenantName: null, tenantNif: null }),
  };
}
