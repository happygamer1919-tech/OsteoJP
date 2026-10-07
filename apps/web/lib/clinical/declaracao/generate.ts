import "server-only";
import { eq } from "drizzle-orm";
import { toClaims, type RequestContext } from "@osteojp/auth";
import { locations, patients, tenants, withTenantContext, type DbTx } from "@osteojp/db";
import { bookingLocationScope, isLocationBookable } from "@/lib/auth/viewer-locations";
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
// writes (nothing persisted).
//
// R45 (strategy, 2026-10-06): "Never issue one without a stamp."
//
// A DECLARATION IS MADE FOR THE LOCATION IT WAS ASKED FOR, AND FOR NO OTHER. The
// carimbo is one clinic's signature, so the location is never guessed: there is
// no tenant-default location anywhere in this file. A request names its
// location (the marcação's, or the one chosen in the dialog for a manual
// entry), and that location must be an ACTIVE one the acting staff member may
// act in, by the rule every booking write already asks (bookingLocationScope,
// isLocationBookable). Anything else is ClinicalError("invalid").
//
// Then the carimbo: a location with no carimbo asset is refused with
// ClinicalError("no_stamp"). Both refusals come before a model is built and
// before a byte is rendered. This function is the only way to a rendered
// declaration, so every caller inherits them.

export type DeclaracaoPdf = { bytes: Uint8Array; filename: string };

export type GenerateDeclaracaoInputs = {
  patientId: string;
  /** Europe/Lisbon calendar date, "YYYY-MM-DD" (from the marcação or manual). */
  date: string;
  /** Europe/Lisbon start/end times, "HH:MM" (editable in the dialog). */
  startTime: string;
  endTime: string;
  /** The location the declaration is FOR: the chosen marcação's, or the one
   *  picked in the dialog for a manual entry. Required. Typed loosely because
   *  it arrives from a server action's caller; a missing one is refused. */
  locationId?: string | null;
  /** W12-24: patient NIF as entered in the dialog (prefilled from `patients.nif`,
   *  editable). Threaded to the model; the declaration is not persisted. */
  nif?: string | null;
  /** PL-03a: optional free-text observações entered in the dialog. Threaded to
   *  the model (rendered between the two body paragraphs); never persisted. */
  observacoes?: string | null;
};

/**
 * The location a declaration was asked for, when the acting staff member may
 * issue one for it; null otherwise. Null is every way a request can fail to
 * name a usable location:
 *
 *   - no `locationId` at all;
 *   - one outside the staff member's locations (`scope` is
 *     `bookingLocationScope`'s answer, resolved by the caller BEFORE its
 *     transaction, because that helper opens its own);
 *   - one that matches no row here (unknown, or another tenant's: RLS);
 *   - one that is archived.
 *
 * It never substitutes another location for the one asked for.
 */
async function readDeclaracaoLocation(
  tx: DbTx,
  scope: string[] | null,
  locationId: string | null | undefined,
): Promise<SourceLocation | null> {
  if (!locationId || !isLocationBookable(scope, locationId)) return null;
  const [loc] = await tx
    .select({
      name: locations.name,
      address: locations.address,
      phone: locations.phone,
      isActive: locations.isActive,
    })
    .from(locations)
    .where(eq(locations.id, locationId))
    .limit(1);
  if (!loc || !loc.isActive) return null;
  return { name: loc.name, address: loc.address, phone: loc.phone };
}

/**
 * R45: whether a declaration for this location can be issued, asked BEFORE
 * anything is spent on the request (the per-user generation ceiling, in the
 * server action). Reads the location row and nothing else.
 *
 *   "invalid"  - no location, or not an active location this staff member may
 *                act in. The request is malformed; nothing is produced.
 *   "no_stamp" - a usable location with no carimbo asset.
 *   "ok"       - a clinic with a carimbo.
 *
 * It asks the same questions of the same row as generateDeclaracaoPdf below,
 * which refuses on its own whether or not a caller asked first.
 */
export async function declaracaoAvailability(
  ctx: RequestContext,
  locationId: string | null | undefined,
): Promise<"ok" | "invalid" | "no_stamp"> {
  const scope = await bookingLocationScope(ctx);
  const location = await withTenantContext(toClaims(ctx), (tx) =>
    readDeclaracaoLocation(tx, scope, locationId),
  );
  if (!location) return "invalid";
  return resolveStampLocationKey(location) === null ? "no_stamp" : "ok";
}

/** "YYYY-MM-DD" → "DD/MM/YYYY" (the date is already the Lisbon calendar day). */
function formatDia(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : date;
}

export async function generateDeclaracaoPdf(
  ctx: RequestContext,
  inputs: GenerateDeclaracaoInputs,
): Promise<DeclaracaoPdf> {
  const scope = await bookingLocationScope(ctx);
  const built = await withTenantContext(toClaims(ctx), async (tx) => {
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

    const location = await readDeclaracaoLocation(tx, scope, inputs.locationId);
    if (!location) return { invalidLocation: true as const };

    return {
      invalidLocation: false as const,
      patientName: patient.fullName,
      tenantSettings: tenant?.settings ?? {},
      localidade: resolveLocalidade(location),
      // W9-03: carry the location IDENTITY through, not just the derived
      // localidade string. Before this, the resolved location was dropped here,
      // so the model layer could not tell which clinic the declaration was for
      // and every declaration got the LV carimbo (CB QA item 2, "erro grave").
      stampLocationKey: resolveStampLocationKey(location),
      // W12-30 C1: the location this declaration is FOR drives the branded
      // footer contact block; the tenant row supplies the fiscal identity
      // (placeholders when unset — never invented).
      sourceLocation: location,
      fiscalSource: { tenantName: tenant?.name ?? null, tenantNif: tenant?.nif ?? null },
    };
  });

  if (!built) throw new ClinicalError("not_found");
  // R45: no location given, or not one this staff member may issue for. Never
  // answered with some other location's declaration.
  if (built.invalidLocation) throw new ClinicalError("invalid");
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
