import "server-only";
import { asc, eq } from "drizzle-orm";
import {
  locations,
  patients,
  tenants,
  withTenantContext,
  type DbTx,
  type TenantClaims,
} from "@osteojp/db";
import { ClinicalError } from "../errors";
import type { SourceLocation } from "../report/location-contacts";
import {
  buildDeclaracaoModel,
  resolveDeclaracaoLocation,
  resolveLocalidade,
  resolveStampLocationKey,
} from "./declaracao-model";
import { renderDeclaracaoPdf } from "./declaracao-pdf";

// Tenant-scoped, READ-ONLY load + render for the Declaração de Presença (W5-31).
// Every query runs through withTenantContext so RLS enforces tenant isolation. No
// writes (nothing persisted). The localidade comes from the selected marcação's
// location, falling back to the tenant's first active location.
//
// R45 (strategy, 2026-10-06): "Never issue one without a stamp." A declaration
// whose location has no carimbo asset is REFUSED here, with
// ClinicalError("no_stamp"), before a model is built and before a byte is
// rendered. This function is the only way to a rendered declaration, so every
// caller inherits the refusal.

export type DeclaracaoPdf = { bytes: Uint8Array; filename: string };

export type GenerateDeclaracaoInputs = {
  patientId: string;
  /** Europe/Lisbon calendar date, "YYYY-MM-DD" (from the marcação or manual). */
  date: string;
  /** Europe/Lisbon start/end times, "HH:MM" (editable in the dialog). */
  startTime: string;
  endTime: string;
  /** The chosen marcação's location, if any (drives the localidade). */
  locationId?: string | null;
  /** W12-24: patient NIF as entered in the dialog (prefilled from `patients.nif`,
   *  editable). Threaded to the model; the declaration is not persisted. */
  nif?: string | null;
  /** PL-03a: optional free-text observações entered in the dialog. Threaded to
   *  the model (rendered between the two body paragraphs); never persisted. */
  observacoes?: string | null;
};

async function tenantDefaultLocation(tx: DbTx): Promise<SourceLocation | null> {
  const rows = await tx
    .select({ name: locations.name, address: locations.address, phone: locations.phone })
    .from(locations)
    .where(eq(locations.isActive, true))
    .orderBy(asc(locations.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The two locations a declaration can be for, in the order they are used: the
 * selected marcação's location, then the tenant's first active location. Read
 * once here for the generator and for the availability check below, so the two
 * cannot look at different rows.
 */
async function loadDeclaracaoLocations(
  tx: DbTx,
  locationId: string | null | undefined,
): Promise<{ appointmentLocation: SourceLocation | null; fallback: SourceLocation | null }> {
  let appointmentLocation: SourceLocation | null = null;
  if (locationId) {
    const [loc] = await tx
      .select({ name: locations.name, address: locations.address, phone: locations.phone })
      .from(locations)
      .where(eq(locations.id, locationId))
      .limit(1);
    appointmentLocation = loc ?? null;
  }
  return { appointmentLocation, fallback: await tenantDefaultLocation(tx) };
}

/**
 * R45: whether a declaration for this marcação location (else the tenant
 * default) can be issued at all, that is, whether that location is a clinic
 * with a carimbo asset. Reads the location rows and nothing else.
 *
 * It exists so a caller can refuse BEFORE it spends anything on the request
 * (the per-user generation ceiling, in the server action). It asks the same
 * question of the same rows as generateDeclaracaoPdf below, which refuses on
 * its own whether or not a caller asked first.
 */
export async function declaracaoStampAvailable(
  claims: TenantClaims,
  locationId: string | null | undefined,
): Promise<boolean> {
  const { appointmentLocation, fallback } = await withTenantContext(claims, (tx) =>
    loadDeclaracaoLocations(tx, locationId),
  );
  return resolveStampLocationKey(appointmentLocation, fallback) !== null;
}

/** "YYYY-MM-DD" → "DD/MM/YYYY" (the date is already the Lisbon calendar day). */
function formatDia(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : date;
}

export async function generateDeclaracaoPdf(
  claims: TenantClaims,
  inputs: GenerateDeclaracaoInputs,
): Promise<DeclaracaoPdf> {
  const built = await withTenantContext(claims, async (tx) => {
    const [patient] = await tx
      .select({ fullName: patients.fullName })
      .from(patients)
      .where(eq(patients.id, inputs.patientId))
      .limit(1);
    if (!patient) return null;

    const [tenant] = await tx
      .select({ settings: tenants.settings, name: tenants.name, nif: tenants.nif })
      .from(tenants)
      .limit(1);

    const { appointmentLocation, fallback } = await loadDeclaracaoLocations(tx, inputs.locationId);

    return {
      patientName: patient.fullName,
      tenantSettings: tenant?.settings ?? {},
      localidade: resolveLocalidade(appointmentLocation, fallback),
      // W9-03: carry the location IDENTITY through, not just the derived
      // localidade string. Before this, the resolved location was dropped here,
      // so the model layer could not tell which clinic the declaration was for
      // and every declaration got the LV carimbo (CB QA item 2, "erro grave").
      stampLocationKey: resolveStampLocationKey(appointmentLocation, fallback),
      // W12-30 C1: the location this declaration is FOR (marcação's, else the
      // tenant default) drives the branded footer contact block; the tenant row
      // supplies the fiscal identity (placeholders when unset — never invented).
      sourceLocation: resolveDeclaracaoLocation(appointmentLocation, fallback),
      fiscalSource: { tenantName: tenant?.name ?? null, tenantNif: tenant?.nif ?? null },
    };
  });

  if (!built) throw new ClinicalError("not_found");
  // R45: no carimbo asset for this declaration's location, so no declaration.
  // Decided on the LOCATION alone: the tenant's signatureStamp switch (leave
  // the area blank for a physical stamp) applies to a clinic that has a
  // carimbo, and does not make a location without one issuable.
  if (!built.stampLocationKey) throw new ClinicalError("no_stamp");

  const model = buildDeclaracaoModel({
    patientName: built.patientName,
    dia: formatDia(inputs.date),
    horaInicio: inputs.startTime,
    horaFim: inputs.endTime,
    localidade: built.localidade,
    stampLocationKey: built.stampLocationKey,
    nif: inputs.nif,
    observacoes: inputs.observacoes,
    sourceLocation: built.sourceLocation,
    fiscalSource: built.fiscalSource,
    tenantSettings: built.tenantSettings,
  });
  const bytes = await renderDeclaracaoPdf(model);
  return { bytes, filename: `declaracao-presenca-${inputs.patientId.slice(0, 8)}.pdf` };
}
