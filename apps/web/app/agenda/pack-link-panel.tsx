"use client";

import { Button } from "@osteojp/ui";

import { s } from "@/lib/i18n";
import type { LinkablePacksView } from "@/lib/packs/link";

type StringKey = keyof typeof s;

/**
 * PACK-01 — attaching an EXISTING appointment to a pacote the patient holds.
 *
 * ==========================================================================
 * THE THREE OUTCOMES ARE THREE SENTENCES, AND THAT IS THE WHOLE DESIGN
 * ==========================================================================
 * An empty offer list has more than one meaning, and they need different words
 * because they need different next steps:
 *
 *   - the visit is ALREADY on a pacote      -> say which one, and its balance
 *   - the visit is CANCELLED                -> it consumes nothing, so a link
 *                                              would be real and do nothing
 *   - the visit has NO SERVICE              -> there is nothing to match
 *   - none of the above, and no options     -> the patient has no pacote that fits
 *
 * Collapsed into one empty list, "already linked" reads as "this patient has no
 * pacote", and reception goes and sells one to somebody who already has it. That
 * is PORTAL-REHYDRATE §1.3 in its most ordinary form: an unknown case wearing
 * the face of a harmless known one.
 *
 * IT IS A PURE COMPONENT, SEPARATE FROM THE DRAWER, so those four branches can
 * be render-tested. The drawer loads `view` in an effect, and effects do not run
 * under `renderToStaticMarkup` - which is the only renderer this app's unit
 * tests have. A panel left inline would have been untestable, and the branch
 * that matters most is the one nobody sees until it is wrong.
 */
export function PackLinkPanel({
  view,
  busyInstanceId,
  error,
  onLink,
}: {
  view: LinkablePacksView;
  /** The instance whose Associar is in flight, or null. */
  busyInstanceId: string | null;
  error: StringKey | null;
  onLink: (instanceId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-v2 border border-border-strong p-3">
      <span className="text-xs font-medium text-text-primary">
        {s["appointment.packLinkTitle"]}
      </span>

      {view.blocked === "already_linked" && (
        <p className="text-sm text-text-secondary" data-testid="pack-link-already">
          {s["appointment.packLinkedTo"]}
          {view.linkedTo
            ? ` ${view.linkedTo.packName} (${view.linkedTo.sessionsAvailable}/${view.linkedTo.sessionsTotal} ${s["packs.sessions"]}).`
            : "."}
        </p>
      )}

      {view.blocked === "cancelled_consumes_nothing" && (
        <p className="text-sm text-text-secondary" data-testid="pack-link-cancelled">
          {s["appointment.packLinkCancelled"]}
        </p>
      )}

      {view.blocked === "no_service" && (
        <p className="text-sm text-text-secondary" data-testid="pack-link-no-service">
          {s["appointment.packLinkNoService"]}
        </p>
      )}

      {view.blocked === null && view.options.length === 0 && (
        <p className="text-sm text-text-secondary" data-testid="pack-link-none">
          {s["appointment.packLinkNone"]}
        </p>
      )}

      {view.blocked === null && view.options.length > 0 && (
        <>
          <p className="text-xs text-text-secondary">{s["appointment.packLinkHint"]}</p>
          <ul className="flex flex-col gap-2">
            {view.options.map((o) => (
              <li key={o.instanceId} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-text-primary">
                  {o.packName}
                  {" · "}
                  <span className="text-text-secondary">
                    {o.sessionsAvailable}/{o.sessionsTotal} {s["packs.sessions"]}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  // EVERY button is disabled while ANY link is in flight, not
                  // just the one pressed. Two pacotes on one visit is exactly
                  // what "cannot link twice" forbids, and the second click is
                  // the easiest way to attempt it.
                  disabled={busyInstanceId != null}
                  onClick={() => onLink(o.instanceId)}
                  data-testid={`pack-link-${o.instanceId}`}
                >
                  {s["appointment.packLinkAction"]}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-error" data-testid="pack-link-error">
          {s[error]}
        </p>
      )}
    </div>
  );
}
