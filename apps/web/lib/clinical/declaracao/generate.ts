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
import { readPhysicalStampPlace } from "./declaracao-settings";

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
//
// S-1012-A1 ruling 4 (2026-10-12): ONE exception, set per location. A location
// with no carimbo image that the tenant has marked "physical stamp"
// (declaracao-settings.ts) is issued with an EMPTY FRAME to stamp by hand and
// the place line stored with its mark. A location with a carimbo image is
// unchanged, marked or not. A location with neither is refused as before.

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
): Promise<(SourceLocation & { id: string }) | null> {
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
  return { id: locationId, name: loc.name, address: loc.address, phone: loc.phone };
}

/**
 * How a location's declaration is stamped, and the place line that goes with
 * it. Null is "neither a carimbo image nor the physical-stamp mark": refused.
 *
 * THE IMAGE COMES FIRST. A clinic with a carimbo is answered from its name
 * alone, exactly as before, and its mark (if somebody set one) is not read.
 */
type DeclaracaoStamp =
  | { kind: "image"; key: string; localidade: string }
  | { kind: "physical"; localidade: string };

function resolveDeclaracaoStamp(
  location: SourceLocation & { id: string },
  tenantSettings: unknown,
): DeclaracaoStamp | null {
  const key = resolveStampLocationKey(location);
  if (key) return { kind: "image", key, localidade: resolveLocalidade(location) };
  const place = readPhysicalStampPlace(tenantSettings, location.id);
  return place ? { kind: "physical", localidade: place } : null;
}

/**
 * R45: whether a declaration for this location can be issued, asked BEFORE
 * anything is spent on the request (the per-user generation ceiling, in the
 * server action). Reads the location row and nothing else.
 *
 *   "invalid"  - no location, or not an active location this staff member may
 *                act in. The request is malformed; nothing is produced.
 *   "no_stamp" - a usable location with no carimbo asset and no
 *                physical-stamp mark.
 *   "ok"       - a clinic with a carimbo, or a location marked "physical stamp".
 *
 * It asks the same questions of the same rows as generateDeclaracaoPdf below,
 * which refuses on its own whether or not a caller asked first. The tenant's
 * settings are read only for a location with no carimbo image.
 */
export async function declaracaoAvailability(
  ctx: RequestContext,
  locationId: string | null | undefined,
): Promise<"ok" | "invalid" | "no_stamp"> {
  const scope = await bookingLocationScope(ctx);
  return withTenantContext(toClaims(ctx), async (tx) => {
    const location = await readDeclaracaoLocation(tx, scope, locationId);
    if (!location) return "invalid";
    if (resolveStampLocationKey(location) !== null) return "ok";
    const [tenant] = await tx.select({ settings: tenants.settings }).from(tenants).limit(1);
    return resolveDeclaracaoStamp(location, tenant?.settings ?? {}) === null ? "no_stamp" : "ok";
  });
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
      // W9-03: carry the location IDENTITY through, not just the derived
      // localidade string. Before this, the resolved location was dropped here,
      // so the model layer could not tell which clinic the declaration was for
      // and every declaration got the LV carimbo (CB QA item 2, "erro grave").
      // S-1012-A1 ruling 4: the stamp AND the place line are one answer, so a
      // declaration cannot carry one location's place over another's stamp.
      stamp: resolveDeclaracaoStamp(location, tenant?.settings ?? {}),
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
  // carimbo, and does not make a location without one issuable. Only that
  // location's own physical-stamp mark does (S-1012-A1 ruling 4).
  if (!built.stamp) throw new ClinicalError("no_stamp");

  const model = buildDeclaracaoModel({
    patientName: built.patientName,
    dia: formatDia(inputs.date),
    horaInicio: inputs.startTime,
    horaFim: inputs.endTime,
    localidade: built.stamp.localidade,
    stampLocationKey: built.stamp.kind === "image" ? built.stamp.key : null,
    physicalStamp: built.stamp.kind === "physical",
    nif: inputs.nif,
    observacoes: inputs.observacoes,
    sourceLocation: built.sourceLocation,
    fiscalSource: built.fiscalSource,
    tenantSettings: built.tenantSettings,
  });
  const bytes = await renderDeclaracaoPdf(model);
  return { bytes, filename: `declaracao-presenca-${inputs.patientId.slice(0, 8)}.pdf` };
}
