import type { Metadata } from "next";
import {
  CURRENT_SURVEY_CONSENT_VERSION,
  DEFAULT_LOCALE,
  LOCALES,
  getStrings,
  type Locale,
} from "@osteojp/i18n";
import { BrandLockup } from "@osteojp/ui";
import { formatDateLong, resolveLocale } from "@/lib/reminders/locale";
import { loadSurveyTenantSettings, resolveSurveyCode } from "@/lib/surveys/survey-store";
import { SurveyForm } from "./survey-form";

// THE SATISFACTION SURVEY PAGE (SAT-01), reached from the link in the survey
// message: `/s/XXXXXXXX`.
//
// Built on /c/[code] and keeping its rules:
//
//   OPENING THE LINK PERFORMS NOTHING. This renders. The answer and the
//   opt-out are written only by the POSTs in actions.ts, so a mail or SMS
//   scanner that follows the link spends nothing.
//
//   THE VISIT DATE ONLY. No patient name, no therapist, no service, no time, no
//   clinic and no clinical content. The page does not read any of them: the
//   door it asks returns a tenant, an appointment id and the visit's end.
//
//   ONE PAGE FOR EVERY LINK THAT IS NOT VALID (SR-30): malformed, never issued,
//   a code of another kind, expired, already answered, already used to opt
//   out, no longer eligible. The page does not say which, and it takes the
//   same lookup for each.
//
//   THE OPT-OUT (S8) IS ON THE FORM, so only a link that is valid shows it. It
//   is offered whatever the survey's switch says: a patient holding a valid
//   link may always ask for no more of them.
//
//   NO SESSION. The page is public like /c/[code]: nothing here asks who the
//   visitor is, and the database is reached on the server's own connection.
//
// While the survey is switched off nothing issues a code, so every link opens
// the "not valid" page.

export const dynamic = "force-dynamic"; // per-request; never cached.

export const metadata: Metadata = {
  title: "OsteoJP",
  robots: { index: false, follow: false },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-surface p-8 shadow-sm">
        <div className="flex justify-center">
          <BrandLockup variant="lockup" />
        </div>
        {children}
      </div>
    </main>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div className="space-y-2 text-center">
        <h1 className="text-h3 font-semibold text-text-primary">{title}</h1>
        <p className="text-body-sm text-text-secondary">{body}</p>
      </div>
    </Shell>
  );
}

/**
 * The one page a link that is not valid gets. ALWAYS IN THE DEFAULT LANGUAGE:
 * a code that resolves to nothing names no clinic, and the refusals that do
 * have a clinic behind them (the limiter's, a second submit's) must not be
 * told apart from the ones that do not by the language they arrive in.
 */
function GenericPage() {
  const s = getStrings(DEFAULT_LOCALE);
  return <Message title={s["survey.page.invalidTitle"]} body={s["survey.page.invalidBody"]} />;
}

function localeOf(value: string | undefined): Locale {
  return (LOCALES as readonly string[]).includes(value ?? "") ? (value as Locale) : DEFAULT_LOCALE;
}

export default async function SurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ r?: string; l?: string }>;
}) {
  const { code } = await params;
  const { r, l } = await searchParams;

  // The finished outcome. It says the same thing for every address it is
  // opened on, so it tells nothing about a code; and the code it follows no
  // longer resolves, which is why the language comes from the flag.
  if (r === "answered") {
    const s = getStrings(localeOf(l));
    return (
      <Message title={s["survey.page.answeredTitle"]} body={s["survey.page.answeredBody"]} />
    );
  }
  // The other finished outcome: the opt-out (S8, texts 28 and 29). The same
  // rule: one page for every address, and nothing is looked up to show it.
  if (r === "optedout") {
    const s = getStrings(localeOf(l));
    return (
      <Message title={s["survey.page.optedOutTitle"]} body={s["survey.page.optedOutBody"]} />
    );
  }

  // A RENDER RESOLVES AND NEVER WRITES. Every code takes this one lookup,
  // whatever its shape: the store looks a malformed one up against a hash that
  // cannot exist, so the page has no faster path for a guess of the wrong
  // shape. An error here (the key is absent, the database is away) is the same
  // page as a link that is not valid.
  const resolved = await resolveSurveyCode({ code }).catch(() => null);

  // EVERY REFUSAL TAKES THIS ONE EXIT. `r=generic` is the action's refusal
  // (the limiter, a second submit); it is read only after the lookup, so it
  // costs what any other refusal costs.
  if (!resolved || r === "generic") return <GenericPage />;

  const locale = resolveLocale(
    await loadSurveyTenantSettings(resolved.tenantId).catch(() => null),
  );
  const s = getStrings(locale);
  const visitDate = formatDateLong(resolved.visitEndsAt, locale);

  return (
    <Shell>
      <div className="space-y-1 text-center">
        <h1 className="text-h3 font-semibold text-text-primary">{s["survey.page.title"]}</h1>
        <p className="text-body-sm text-text-secondary">
          {/* A FUNCTION REPLACEMENT, never a string: `$&` and friends in a
              replacement string are expanded by String.replace. */}
          {s["survey.page.visitLine"].replace(/\{date\}/g, () => visitDate)}
        </p>
      </div>

      <SurveyForm
        code={code}
        locale={locale}
        consentVersion={CURRENT_SURVEY_CONSENT_VERSION}
        labels={{
          instruction: s["survey.page.instruction"],
          whoReads: s["survey.page.whoReads"],
          q1: s["survey.page.q1"],
          q1Low: s["survey.page.q1Low"],
          q1High: s["survey.page.q1High"],
          q2: s["survey.page.q2"],
          q2Low: s["survey.page.q2Low"],
          q2High: s["survey.page.q2High"],
          q3: s["survey.page.q3"],
          q3Hint: s["survey.page.q3Hint"],
          healthNote: s["survey.page.healthNote"],
          contactConsent: s["survey.page.contactConsent"],
          submit: s["survey.page.submit"],
          errorSummary: s["survey.page.errorSummary"],
          q1Error: s["survey.page.q1Error"],
          q2Error: s["survey.page.q2Error"],
          commentError: s["survey.page.commentError"],
          saveError: s["survey.page.saveError"],
          optOutSaveError: s["survey.page.optOutSaveError"],
          optOut: s["survey.page.optOut"],
          optOutNote: s["survey.page.optOutNote"],
        }}
      />
    </Shell>
  );
}
