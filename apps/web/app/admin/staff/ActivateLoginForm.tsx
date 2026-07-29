"use client";
import { useActionState } from "react";
import { Button } from "@osteojp/ui";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";
import { activateLoginAction, type ActivateLoginState } from "./actions";

const s = getStrings(DEFAULT_LOCALE);
const initial: ActivateLoginState = { ok: false };

/**
 * PL-07 / PL-08: per-staff "Ativar login" control inside the Gerir modal. Creates
 * (or re-issues) a Supabase login on THIS existing staff row and shows the READY
 * credentials — the login email + a freshly generated password — for the admin to
 * hand over. No link, no email. Re-clicking resets the password to a new one.
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

      {state.ok && state.email && state.password && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-v2 border border-success bg-success-bg p-3 text-sm text-v2-text-primary"
        >
          <p className="font-medium text-success-700">{s["admin.staff.loginCredentialsTitle"]}</p>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-v2-text-secondary">{s["admin.staff.usernameLabel"]}</span>
            <code className="block break-all rounded bg-v2-surface px-2 py-1 font-mono">
              {state.email}
            </code>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-v2-text-secondary">{s["admin.staff.passwordLabel"]}</span>
            <code className="block break-all rounded bg-v2-surface px-2 py-1 font-mono">
              {state.password}
            </code>
          </div>
          <p className="text-xs text-v2-text-secondary">{s["admin.staff.credentialsNotice"]}</p>
        </div>
      )}
      {errorText && <p role="alert" className="text-sm text-error">{errorText}</p>}
    </form>
  );
}
