import "server-only";
import { assertCan, toClaims, type RequestContext } from "@osteojp/auth";
import type { Locale } from "@osteojp/i18n";
import { exportDefaults, type ExportRow } from "./export-overrides";
import { registoReadScope } from "./generate";
import { loadClinicalReportInputs } from "./load";
import { isPrintable } from "./report-model";

/**
 * RODICA-export-edit-before-download: THE ROWS OF THE EXPORT DIALOG, one per
 * registo the file would print, with what each prints when nothing is
 * changed: the appointment's date and hour, and the heading of its stored
 * view (export-overrides.ts `exportDefaults`).
 *
 * READ-ONLY and the RENDER'S OWN REACH: each registo is read by the loader
 * the per-record engine reads it with (`loadClinicalReportInputs`), under the
 * registo page's read scope (`registoReadScope`) and the caller's own claims
 * and RLS. A registo the engine would not print (not found, a draft, under AI
 * review) has no row, as it would have no page. Nothing is written, and no
 * document is made, so no ceiling is spent and no audit row is due.
 *
 * `groups` is the export's own selection, in the file's order, made by the
 * server; the dialog never names the registos it is shown.
 */
export async function readExportRows(
  ctx: RequestContext,
  groups: readonly { group: string | null; recordIds: readonly string[] }[],
  locale: Locale,
): Promise<ExportRow[]> {
  assertCan(ctx.role, "clinical_records:read");
  const scope = await registoReadScope(ctx);
  const claims = toClaims(ctx);
  const rows: ExportRow[] = [];
  for (const { group, recordIds } of groups) {
    for (const recordId of recordIds) {
      const inputs = await loadClinicalReportInputs(claims, recordId, scope.value);
      if (!inputs || !isPrintable(inputs.record)) continue;
      const defaults = exportDefaults(inputs.record, locale);
      if (!defaults) continue;
      rows.push({ recordId: inputs.record.id, group, version: inputs.record.version, ...defaults });
    }
  }
  return rows;
}
