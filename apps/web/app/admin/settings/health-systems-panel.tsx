import { Plus } from "lucide-react";
import { GlassPanel, StatusBadge } from "@osteojp/ui";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import type { HealthSystemOption } from "@/lib/admin/health-systems-core";
import {
  addHealthSystemAction,
  setHealthSystemActiveAction,
  setHealthSystemsPriceTableAction,
} from "./actions";
import { adminHelp, adminInput, adminLabel } from "../admin-ui";

const s = getStrings(DEFAULT_LOCALE);

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

/** The message for an hs- code from the panel's own actions, or null for any other code. */
export function healthSystemsBanner(m: string | undefined): { ok: boolean; text: string } | null {
  switch (m) {
    case "hs-ok":
      return { ok: true, text: s["admin.settings.saved"] };
    case "hs-reactivated":
      return { ok: true, text: s["admin.settings.healthSystemReactivated"] };
    case "hs-err:name_taken":
      return { ok: false, text: s["admin.settings.healthSystemNameTaken"] };
    case "hs-err:invalid":
      return { ok: false, text: s["admin.settings.healthSystemNameInvalid"] };
    default:
      return m?.startsWith("hs-err") ? { ok: false, text: s["admin.settings.error"] } : null;
  }
}

/**
 * "Sistemas / SubSistemas", copied from Fisiozero's panel in structure and
 * behaviour (owner request 2026-11-02), in OsteoJP's own design:
 *   1. a text box "Novo Sistema Sub/Sistema..." and a plus button (tooltip
 *      "Adicionar novo Sistema / SubSistema");
 *   2. the list of the clinic's entries. PROVISIONAL LAYOUT: the clinic's own
 *      Fisiozero list was empty, so there was no list to copy. One line per
 *      entry, its name, an Ativo/Desativado badge, and a Desativar/Reativar
 *      button. Entries are never deleted (a ficha that names one keeps it);
 *   3. a dotted rule;
 *   4. the row "Usa tabela de preços de Sistemas", its sub-text, and a switch.
 *      THE SWITCH IS STORED AND DOES NOTHING YET: no booking, price or invoice
 *      path reads it.
 * Each control is its own form, so nothing here rides on the main settings save.
 */
export function HealthSystemsPanel({
  entries,
  priceTableEnabled,
  message,
}: {
  entries: HealthSystemOption[];
  priceTableEnabled: boolean;
  message: { ok: boolean; text: string } | null;
}) {
  return (
    <GlassPanel>
      <section id="sistemas" aria-labelledby="sistemas-title" className="flex flex-col gap-3">
        <h3 id="sistemas-title" className="text-lg text-v2-text-primary">
          {s["admin.settings.sectionHealthSystems"]}
        </h3>

        {message && (
          <p className={`text-sm ${message.ok ? "text-success-700" : "text-error"}`} role="status">
            {message.text}
          </p>
        )}

        <form action={addHealthSystemAction} className="flex items-center gap-2">
          <input
            name="name"
            required
            maxLength={120}
            autoComplete="off"
            placeholder={s["admin.settings.healthSystemNewPlaceholder"]}
            aria-label={s["admin.settings.healthSystemNewPlaceholder"]}
            className={adminInput}
          />
          <button
            type="submit"
            title={s["admin.settings.healthSystemAdd"]}
            aria-label={s["admin.settings.healthSystemAdd"]}
            className={`inline-flex size-9 shrink-0 items-center justify-center rounded-v2 bg-v2-green-700 text-text-inverse hover:bg-v2-green-800 ${focusRing}`}
          >
            <Plus size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </form>

        {entries.length === 0 ? (
          <p className={adminHelp}>{s["admin.settings.healthSystemEmpty"]}</p>
        ) : (
          <ul aria-label={s["admin.settings.healthSystemListLabel"]} className="flex flex-col">
            {entries.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-3 border-b border-v2-border py-2 last:border-b-0"
              >
                <span className={`text-sm ${h.active ? "text-v2-text-primary" : "text-v2-text-secondary"}`}>
                  {h.name}
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge tone={h.active ? "confirmed" : "cancelled"}>
                    {h.active ? s["admin.settings.healthSystemActive"] : s["admin.settings.healthSystemInactive"]}
                  </StatusBadge>
                  <form action={setHealthSystemActiveAction}>
                    <input type="hidden" name="id" value={h.id} />
                    <input type="hidden" name="active" value={h.active ? "false" : "true"} />
                    <button
                      type="submit"
                      aria-label={`${
                        h.active
                          ? s["admin.settings.healthSystemDeactivate"]
                          : s["admin.settings.healthSystemReactivate"]
                      } ${h.name}`}
                      className={`rounded-v2 px-2 py-1 text-sm text-accent-2-700 hover:underline ${focusRing}`}
                    >
                      {h.active
                        ? s["admin.settings.healthSystemDeactivate"]
                        : s["admin.settings.healthSystemReactivate"]}
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}

        <hr className="border-0 border-t-2 border-dotted border-v2-border" />

        <form action={setHealthSystemsPriceTableAction} className="flex items-start justify-between gap-4">
          <input type="hidden" name="enabled" value={priceTableEnabled ? "false" : "true"} />
          <span className="flex flex-col gap-1">
            <span id="sistemas-price-table" className={adminLabel}>
              {s["admin.settings.healthSystemPriceTable"]}
            </span>
            <span className={adminHelp}>{s["admin.settings.healthSystemPriceTableHint"]}</span>
          </span>
          <button
            type="submit"
            role="switch"
            aria-checked={priceTableEnabled}
            aria-labelledby="sistemas-price-table"
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-v2-border transition-colors ${
              priceTableEnabled ? "bg-v2-green-700" : "bg-v2-surface"
            } ${focusRing}`}
          >
            <span
              aria-hidden="true"
              className={`inline-block size-4 rounded-full shadow transition-transform ${
                priceTableEnabled ? "translate-x-6 bg-v2-surface" : "translate-x-1 bg-v2-text-secondary"
              }`}
            />
          </button>
        </form>
      </section>
    </GlassPanel>
  );
}
