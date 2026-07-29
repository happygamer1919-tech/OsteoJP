"use client";
import { useActionState } from "react";
import { Button } from "@osteojp/ui";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { activateLoginAction, type ActivateLoginState } from "./actions";

const s = getStrings(DEFAULT_LOCALE);
const initial: ActivateLoginState = { ok: false };

/**
 * PL-07: per-staff "Ativar login" control inside the Gerir modal. Attaches a
 * Supabase login to THIS existing staff row (same id, history preserved) and
 * surfaces the set-password hand-off (email sent, a link to relay, or — for a
 * freshly minted auth user with email delivery off — a temporary password).
 * Idempotent, so re-clicking just re-issues the link.
 */
export function ActivateLoginForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(activateLoginAction, initial);

  const errorByCode: Record<string, string> = {
    owner_tier: s["admin.staff.ownerTierBlocked"],
    auth_email_taken: s["admin.staff.authEmailTakenBlocked"],
    provisioning_unavailable: s["admin.staff.provisioningUnavailableBlocked"],
  };
  const errorText = state.code ? (errorByCode[state.code] ?? s["admin.staff.error"]) : null;

  return (
    <form action={action} className="flex flex-col gap-2">
      <p className="text-xs text-v2-text-secondary">{s["admin.staff.activateLoginHelp"]}</p>
      <input type="hidden" name="userId" value={userId} />
      <div>
        <Button type="submit" disabled={pending} loading={pending} variant="secondary" size="sm">
          {s["admin.staff.activateLoginButton"]}
        </Button>
      </div>

      {state.ok && state.delivery === "email" && (
        <div role="status" className="rounded-v2 border border-success bg-success-bg p-3 text-sm text-v2-text-primary">
          <p className="font-medium text-success-700">{s["admin.staff.loginActivated"]}</p>
          <p className="mt-1">{s["admin.staff.activateEmailSent"]}</p>
        </div>
      )}
      {state.ok && state.delivery === "link" && state.setPasswordLink && (
        <div role="status" className="rounded-v2 border border-success bg-success-bg p-3 text-sm text-v2-text-primary">
          <p className="font-medium text-success-700">{s["admin.staff.loginActivated"]}</p>
          <p className="mt-1">{s["admin.staff.activateLinkNotice"]}</p>
          <code className="mt-1 block break-all rounded bg-v2-surface px-2 py-1 font-mono text-xs">
            {state.setPasswordLink}
          </code>
        </div>
      )}
      {state.ok && state.delivery === "temp_password" && state.tempPassword && (
        <div role="status" className="rounded-v2 border border-success bg-success-bg p-3 text-sm text-v2-text-primary">
          <p className="font-medium text-success-700">{s["admin.staff.loginActivated"]}</p>
          <p className="mt-1">{s["admin.staff.tempPasswordNotice"]}</p>
          <code className="mt-1 block break-all rounded bg-v2-surface px-2 py-1 font-mono">
            {state.tempPassword}
          </code>
        </div>
      )}
      {errorText && <p role="alert" className="text-sm text-error">{errorText}</p>}
    </form>
  );
}
