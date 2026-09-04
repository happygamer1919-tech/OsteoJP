"use client";

import { useEffect, useState } from "react";
import type { Span } from "@/lib/perf/request-timing";

/**
 * THE OWNER-READABLE HALF OF PERF-timing-admin-stats.
 *
 * ==========================================================================
 * WHY A PANEL AND NOT A Server-Timing HEADER
 * ==========================================================================
 * A header is cheaper and it was the first design. It was rejected for one
 * reason: the instruction is that the owner must be able to read this ON
 * PRODUCTION WITHOUT A TERMINAL, and a `Server-Timing` header is readable only
 * in a devtools network panel. This project has already paid for instruments
 * nobody could reach - `projected`/`absent` were returned by the AI drift check
 * for weeks and read by nobody, which is why AI-02 moved that signal onto the
 * reviewer's screen.
 *
 * THE CLIENT HALF IS NOT DECORATION. Server spans cannot answer hypothesis 4 -
 * "client bundle and hydration rather than the server at all" - because by
 * definition the server is finished before that starts. `responseStart` and the
 * moment this component's effect runs are the two ends of that gap and only the
 * browser holds them, so they are read here, from the Navigation Timing API,
 * with no extra request.
 *
 * ==========================================================================
 * IT RENDERS NOTHING FOR ANYBODY WHO IS NOT AN ADMIN, AND NOT BECAUSE IT ASKS
 * ==========================================================================
 * There is no role check in this file, deliberately. The PAGE decides, and for
 * a non-admin the element is never created - so the spans are never serialised
 * into the RSC payload at all. A component that received the data and declined
 * to draw it would have shipped the numbers to the browser anyway, which is the
 * difference between hiding a control and not granting it (INC-CONFIRM-10, one
 * layer over).
 */

/** What the browser knows and the server cannot. */
type ClientTiming = {
  /** Navigation start to the first response byte. */
  ttfbMs: number;
  /** First byte to the response being fully received. */
  downloadMs: number;
  /** Response received to this component's first effect - hydration. */
  hydrateMs: number;
  /** Navigation start to that same effect. The number the owner actually felt. */
  totalMs: number;
};

function readClientTiming(): ClientTiming | null {
  const nav = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  // NULL MEANS ONE THING: the browser has no navigation entry for this document
  // (a bfcache restore, or a soft client-side navigation). It is NOT folded in
  // with "the numbers were zero" - the panel says which it is.
  if (!nav) return null;
  const now = performance.now();
  return {
    ttfbMs: round(nav.responseStart),
    downloadMs: round(nav.responseEnd - nav.responseStart),
    hydrateMs: round(now - nav.responseEnd),
    totalMs: round(now),
  };
}

const round = (ms: number): number => Math.round(ms * 10) / 10;

const cell = "px-2 py-1 text-left align-top";
const num = "px-2 py-1 text-right tabular-nums align-top whitespace-nowrap";

export function TimingPanel({
  spans,
  serverMs,
  route,
}: {
  spans: Span[];
  /** Wall-clock inside the server component, from `collectFor()`. */
  serverMs: number;
  route: string;
}) {
  const [client, setClient] = useState<ClientTiming | null>(null);
  const [open, setOpen] = useState(false);

  // ==========================================================================
  // THE CLOCK IS READ SYNCHRONOUSLY; ONLY THE setState IS DEFERRED.
  // ==========================================================================
  // In an effect, not during render: the whole point of `hydrateMs` is the
  // distance to the moment React finishes, and reading the clock during render
  // would measure something earlier and call it that.
  //
  // The `setState` is then handed to a microtask because calling it
  // synchronously inside an effect triggers cascading renders, which the repo's
  // lint rule refuses - correctly. Deferring the READ instead would have been
  // the easy fix and the wrong one: it would move the measurement by a frame
  // and quietly report a different quantity under the same label.
  useEffect(() => {
    const reading = readClientTiming();
    queueMicrotask(() => setClient(reading));
  }, []);

  const miss = spans.some((s) => s.name === "stat-strip:MISS");
  const dbTotal = round(
    spans.filter((s) => s.name.startsWith("db:")).reduce((a, s) => a + s.ms, 0),
  );

  return (
    <section
      aria-label="Medição de desempenho"
      className="rounded-v2 border border-v2-border bg-surface-muted/60 text-xs text-v2-text-secondary"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <span>
          Medição · {route} · servidor {serverMs} ms · BD {dbTotal} ms ·{" "}
          {miss ? "estatísticas CALCULADAS" : "estatísticas em cache"}
          {client ? ` · total sentido ${client.totalMs} ms` : ""}
        </span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>

      {open ? (
        <div className="overflow-x-auto border-t border-v2-border px-3 py-2">
          <table className="w-full min-w-[28rem] border-collapse">
            <caption className="sr-only">
              Repartição do tempo desta requisição, servidor e cliente
            </caption>
            <thead>
              <tr className="text-v2-text-primary">
                <th scope="col" className={cell}>
                  Fase
                </th>
                <th scope="col" className={num}>
                  ms
                </th>
                <th scope="col" className={cell}>
                  Detalhe
                </th>
              </tr>
            </thead>
            <tbody>
              {/* CLIENT FIRST, because it is the only part that contains the
                  number the owner actually experienced. A table that opened
                  with server spans would invite reading the server total as
                  "the wait", which is the confusion this card exists to end. */}
              {client ? (
                <>
                  <tr>
                    <td className={cell}>Primeiro byte (TTFB)</td>
                    <td className={num}>{client.ttfbMs}</td>
                    <td className={cell}>navegação → primeiro byte</td>
                  </tr>
                  <tr>
                    <td className={cell}>Transferência</td>
                    <td className={num}>{client.downloadMs}</td>
                    <td className={cell}>primeiro byte → resposta completa</td>
                  </tr>
                  <tr>
                    <td className={cell}>Hidratação</td>
                    <td className={num}>{client.hydrateMs}</td>
                    <td className={cell}>resposta completa → interativo</td>
                  </tr>
                  <tr className="font-medium text-v2-text-primary">
                    <td className={cell}>Total sentido</td>
                    <td className={num}>{client.totalMs}</td>
                    <td className={cell}>o que a pessoa esperou</td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td className={cell} colSpan={3}>
                    Sem medição do cliente: este documento não tem entrada de navegação
                    (restauro de cache ou navegação interna). Recarregue a página.
                  </td>
                </tr>
              )}

              <tr className="font-medium text-v2-text-primary">
                <td className={cell}>Função do servidor</td>
                <td className={num}>{serverMs}</td>
                <td className={cell}>total dentro do componente</td>
              </tr>
              {spans.map((s, i) => (
                <tr key={`${s.name}-${i}`}>
                  <td className={cell}>{s.name}</td>
                  <td className={num}>{s.ms === 0 ? "—" : s.ms}</td>
                  <td className={cell}>{s.detail ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 leading-snug">
            Consultas <code>db:*</code> incluem a espera por ligação, o <code>set local</code>{" "}
            das credenciais e o commit, com RLS ativo. Correm em paralelo, por isso a soma
            pode exceder o total do servidor.
          </p>
        </div>
      ) : null}
    </section>
  );
}
