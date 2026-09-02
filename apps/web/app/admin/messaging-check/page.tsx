import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth/context";
import { s } from "@/lib/i18n";
import { confirmLinkEnabled, confirmLinkReason } from "@/lib/reminders/confirm-code";
import { adminHelp, adminLabel } from "../admin-ui";
import { sendMessagingCheckAction } from "./actions";

export const metadata = { title: s["admin.messagingCheck.title"] };

// CONFIRM-02 task 2. The owner's own delivery test.
//
// OWNER ONLY, ENFORCED IN TWO PLACES. This route redirects any non-owner, and
// the server action re-checks — a page gate hides a form, it does not protect a
// POST. The action is the endpoint that matters.
//
// It sends ONE real message through the production path, five a day, audited.
// What it proves is what no test can: what a Portuguese handset shows.

export default async function MessagingCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; len?: string; live?: string; d?: string }>;
}) {
  const actor = await getRequestContext();
  if (!actor) redirect("/login");
  if (actor.role !== "owner") redirect("/dashboard");

  const { m, len, live, d } = await searchParams;
  const armed = confirmLinkEnabled();

  const banner =
    m === "sent"
      ? {
          ok: true,
          text:
            `${s["admin.messagingCheck.sent"]} ${len ?? "?"}/160` +
            ` — ${live === "1" ? s["admin.messagingCheck.liveCode"] : s["admin.messagingCheck.sampleCode"]}`,
        }
      : m === "limited"
        ? { ok: false, text: s["admin.messagingCheck.limited"] }
        : m === "invalid_phone"
          ? { ok: false, text: s["admin.messagingCheck.invalidPhone"] }
          : m === "landline"
            ? { ok: false, text: s["admin.messagingCheck.landline"] }
            : m === "no_link"
              ? { ok: false, text: s["admin.messagingCheck.noLink"] }
              : m
                ? {
                    ok: false,
                    // THE PROVIDER'S REASON, SHOWN. A diagnostic page that says
                    // only "not sent" sends the reader to a dashboard; this one
                    // exists to answer why.
                    text: d ? `${s["admin.messagingCheck.failed"]} ${d}` : s["admin.messagingCheck.failed"],
                  }
                : null;

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl text-v2-text-primary">{s["admin.messagingCheck.title"]}</h2>
      <p className={adminHelp}>{s["admin.messagingCheck.help"]}</p>

      {banner ? (
        <p
          className={
            banner.ok
              ? "rounded border border-brand-teal/40 bg-brand-teal/10 p-3 text-body-sm"
              : "rounded border border-border bg-bg p-3 text-body-sm"
          }
        >
          {banner.text}
        </p>
      ) : null}

      {/* THE ARMING STATE, IN WORDS, because the commonest reason a delivery
          test does nothing is that the capability is off — and the operator who
          armed it is the person reading this page. `confirmLinkReason` names
          which of the two variables is missing and never prints either value. */}
      <p className={adminHelp}>{confirmLinkReason()}</p>

      <form action={sendMessagingCheckAction} className="flex max-w-lg flex-col gap-4">
        <label className={adminLabel}>
          {s["admin.messagingCheck.phoneLabel"]}
          <input
            type="tel"
            name="phone"
            required
            placeholder="+351912345678"
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2"
          />
        </label>

        <label className={adminLabel}>
          {s["admin.messagingCheck.appointmentLabel"]}
          <input
            type="text"
            name="appointmentId"
            placeholder="(opcional)"
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2"
          />
        </label>

        <button
          type="submit"
          disabled={!armed}
          className="rounded bg-brand-teal px-4 py-2 font-medium text-text-inverse disabled:opacity-50"
        >
          {s["admin.messagingCheck.send"]}
        </button>
      </form>
    </section>
  );
}
