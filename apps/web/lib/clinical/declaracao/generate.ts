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
  resolveLocalidade,
  resolveStampLocationKey,
} from "./declaracao-model";
import { renderDeclaracaoPdf } from "./declaracao-pdf";

// Tenant-scoped, READ-ONLY load + render for the Declaração de Presença (W5-31).
// Every query runs through withTenantContext so RLS enforces tenant isolation. No
// writes (nothing persisted). The localidade comes from the selected marcação's
// location, falling back to the tenant's first active location.

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

    const [tenant] = await tx.select({ settings: tenants.settings }).from(tenants).limit(1);

    let appointmentLocation: SourceLocation | null = null;
    if (inputs.locationId) {
      const [loc] = await tx
        .select({ name: locations.name, address: locations.address, phone: locations.phone })
        .from(locations)
        .where(eq(locations.id, inputs.locationId))
        .limit(1);
      appointmentLocation = loc ?? null;
    }
    const fallback = await tenantDefaultLocation(tx);

    return {
      patientName: patient.fullName,
      tenantSettings: tenant?.settings ?? {},
      localidade: resolveLocalidade(appointmentLocation, fallback),
      // W9-03: carry the location IDENTITY through, not just the derived
      // localidade string. Before this, the resolved location was dropped here,
      // so the model layer could not tell which clinic the declaration was for
      // and every declaration got the LV carimbo (CB QA item 2, "erro grave").
      stampLocationKey: resolveStampLocationKey(appointmentLocation, fallback),
    };
  });

  if (!built) throw new ClinicalError("not_found");

  const model = buildDeclaracaoModel({
    patientName: built.patientName,
    dia: formatDia(inputs.date),
    horaInicio: inputs.startTime,
    horaFim: inputs.endTime,
    localidade: built.localidade,
    stampLocationKey: built.stampLocationKey,
    nif: inputs.nif,
    tenantSettings: built.tenantSettings,
  });
  const bytes = await renderDeclaracaoPdf(model);
  return { bytes, filename: `declaracao-presenca-${inputs.patientId.slice(0, 8)}.pdf` };
}
