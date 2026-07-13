// RGPD print-and-sign form model (SPEC-ficha-medica.md sec 7.2).
//
// The "Gerar PDF" action produces an A4 RGPD consent form carrying the clinic
// logo + print-branding (location contacts + fiscal identification) for the
// patient to print and sign by hand. This is the PURE projection: it reuses the
// clinical-report branding helpers (resolveLocationContact, resolveClinicFiscal)
// so the RGPD form and the clinical report share ONE branding source. No DB, no
// PDF lib, no i18n here - the renderer applies labels + draws.
//
// The RGPD body wording is final (W5-33); the renderer pulls it from
// the i18n consent keys. This module only assembles patient identity + branding.

// Import the PURE leaf modules directly (not the report barrel): the barrel
// re-exports generate.ts, which is `server-only`, and pulling it in would poison
// this pure, node-testable module.
import {
  resolveClinicFiscal,
  type ClinicFiscalSource,
} from "../report/clinic-fiscal";
import {
  resolveLocationContact,
  type LocationContact,
  type SourceLocation,
} from "../report/location-contacts";

/** Inputs loaded (tenant-scoped) for the RGPD form. */
export type RgpdFormInputs = {
  patient: { fullName: string; nif: string | null };
  clinic: ClinicFiscalSource;
  location: SourceLocation;
};

/** Print-ready RGPD form model. */
export type RgpdFormModel = {
  clinic: { fiscalName: string; nif: string };
  location: LocationContact;
  patient: { fullName: string; nif: string | null };
};

/** Assemble the print-ready RGPD model from loaded inputs. Pure, never throws. */
export function buildRgpdFormModel(inputs: RgpdFormInputs): RgpdFormModel {
  return {
    clinic: resolveClinicFiscal(inputs.clinic),
    location: resolveLocationContact(inputs.location),
    patient: {
      fullName: inputs.patient.fullName,
      nif: inputs.patient.nif,
    },
  };
}
