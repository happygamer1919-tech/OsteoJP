import { redirect } from "next/navigation";

import { getRequestContext } from "@/lib/auth/context";
import { serverSentryConfigured } from "@/lib/observability/sentry-dsn";

export const metadata = { title: "Verificação do Sentry" };

/**
 * The Sentry verification surface. OWNER ONLY.
 *
 * ==========================================================================
 * WHY A DELIBERATE THROW IS THE ONLY HONEST TEST
 * ==========================================================================
 * On 2026-08-21 the owner opened the Sentry project and found the ONBOARDING
 * screen: step 2, Verify, never completed. **Zero events had ever arrived** —
 * through months of deployments, and through a page that threw on every single
 * request for a day.
 *
 * Everything about the wiring looked right the whole time: `Sentry.init` is
 * called, `onRequestError` is exported, the config files exist and are careful
 * about PII. **None of that is evidence.** `Sentry.init({ dsn: undefined })`
 * accepts the call and discards every event in silence, so a code review can
 * confirm the wiring forever and learn nothing about whether anything arrives.
 *
 * The only thing that settles it is an error somebody deliberately caused,
 * seen landing on the other side. That is what this page is for, and it is why
 * `LE-sentry-capture-unverified` may not be closed on anything else — including
 * a green build of this file.
 *
 * ==========================================================================
 * OWNER ONLY, BY ROLE AND NOT BY CAPABILITY, DELIBERATELY
 * ==========================================================================
 * There is no `observability:*` capability and inventing one would put a
 * diagnostic on the permission matrix, which is a product surface. This page
 * belongs to whoever owns the DEPLOYMENT, which is exactly one person. Reception
 * and therapists have no reason to reach a page whose only feature is breaking.
 *
 * IT THROWS ONLY ON `?throw=1`. Visiting it plainly reports configuration and
 * does nothing, so a bookmark or a stray refresh cannot manufacture noise in an
 * issue tracker somebody is trying to read.
 */
export default async function SentryCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ throw?: string }>;
}) {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "owner") redirect("/");

  const { throw: shouldThrow } = await searchParams;

  if (shouldThrow === "1") {
    /**
     * A MARKER THAT CAN BE SEARCHED FOR, and a timestamp so two runs are two
     * issues rather than one issue with a rising count. Without the marker the
     * event is a generic TypeError in a tracker that may hold thousands.
     *
     * THROWN FROM A SERVER COMPONENT RENDER ON PURPOSE. That is the exact path
     * INC-12 took, and the exact path `onRequestError` claims to cover. A
     * `captureException` call would prove less: it would test the transport
     * while skipping the hook whose coverage is the open question.
     */
    throw new Error(
      `OSTEOJP-SENTRY-VERIFY ${new Date().toISOString()} — deliberate test error from /admin/sentry-check`,
    );
  }

  const configured = serverSentryConfigured();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-v2-text-primary">Verificação do Sentry</h1>
        <p className="mt-1 max-w-3xl text-sm text-v2-text-secondary">
          Esta página existe para provar, com um erro verdadeiro, que os erros do
          servidor chegam ao Sentry. Não é uma configuração: é a única prova que
          conta.
        </p>
      </div>

      <div className="rounded-v2 border border-v2-border bg-surface-base p-4">
        <p className="text-sm font-medium text-v2-text-primary">
          SENTRY_DSN:{" "}
          {configured ? (
            <span>configurado</span>
          ) : (
            <span>NÃO CONFIGURADO — nenhum erro está a ser enviado</span>
          )}
        </p>
        {/* THE NAME, NEVER THE VALUE. A DSN is a credential-shaped string and
            standing rule 3 forbids putting one on a screen. */}
        <p className="mt-1 text-xs text-v2-text-secondary">
          Só é mostrado se a variável existe, nunca o seu valor.
        </p>
      </div>

      <div className="rounded-v2 border border-v2-border bg-surface-muted p-4">
        <p className="text-sm text-v2-text-primary">
          Ao carregar no link abaixo, esta página vai falhar de propósito. Isso é
          o esperado. A seguir, procure no Sentry por{" "}
          <span className="font-medium">OSTEOJP-SENTRY-VERIFY</span>.
        </p>
        <p className="mt-2 text-sm text-v2-text-secondary">
          Se o erro aparecer no Sentry, a captura funciona. Se não aparecer, não
          funciona — e não há nenhuma outra leitura possível.
        </p>
        <a
          href="/admin/sentry-check?throw=1"
          className="mt-3 inline-block rounded-v2 border border-v2-border px-3 py-1.5 text-xs font-semibold"
        >
          Provocar um erro de teste
        </a>
      </div>
    </div>
  );
}
