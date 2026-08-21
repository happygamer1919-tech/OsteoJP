"use client";

/**
 * The boundary for the deliberate throw. It is expected to render — that is the
 * whole point of the page — so it explains what just happened rather than
 * apologising for it.
 *
 * NOT SHARED WITH THE REST OF /admin. A generic "algo correu mal" here would
 * leave the owner unsure whether the test worked or the app broke, which is the
 * one ambiguity this page exists to remove.
 */
export default function SentryCheckError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-v2-text-primary">
        Erro de teste provocado com sucesso
      </h1>
      <p className="max-w-3xl text-sm text-v2-text-secondary">
        Isto é o resultado esperado. O servidor falhou de propósito e o erro foi
        entregue ao Sentry — se a captura estiver a funcionar.
      </p>
      <p className="max-w-3xl text-sm text-v2-text-primary">
        Abra o Sentry e procure por <span className="font-medium">OSTEOJP-SENTRY-VERIFY</span>.
        Se encontrar o erro, a captura funciona. Se não encontrar, não funciona.
      </p>
      <button
        type="button"
        onClick={reset}
        className="self-start rounded-v2 border border-v2-border px-3 py-1.5 text-xs font-semibold"
      >
        Voltar
      </button>
    </div>
  );
}
