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

/**
 * WHAT THE BROWSER KNOWS AND THE SERVER CANNOT - AND WHETHER IT KNOWS IT ABOUT
 * THIS PAGE.
 *
 * ==========================================================================
 * THE DEFECT THIS UNION EXISTS TO END, WHICH COST A REAL MEASUREMENT
 * ==========================================================================
 * The first version returned `ClientTiming | null` and its comment said null
 * meant "a bfcache restore, or a soft client-side navigation". THE SECOND HALF
 * WAS FALSE. After a soft navigation the browser still has a navigation entry -
 * it belongs to the PREVIOUS document - so the function returned a complete,
 * plausible-looking reading of the wrong event:
 *
 *   Primeiro byte (TTFB)  the previous page's
 *   Hidratacao            now minus the PREVIOUS response end, so it grows for
 *                         as long as the tab has been open
 *   Total sentido         performance.now(), which is THE AGE OF THE TAB
 *
 * The staff shell navigates with next/link, so clicking *Pacientes* in the
 * sidebar is a soft navigation. On 2026-09-05 the owner logged out, logged in,
 * clicked Pacientes and felt about five seconds. Had he found the panel it would
 * have shown him a number of roughly that size that meant something else
 * entirely, and it would have CONFIRMED the hypothesis by accident.
 *
 * ==========================================================================
 * THREE STATES, NAMED, BECAUSE THEY ARE THREE DIFFERENT FACTS
 * ==========================================================================
 * `document`   this document was loaded from the network and the entry is its
 *              own. The only state in which a number may be shown.
 * `soft-nav`   a navigation entry exists and belongs to another URL. REFUSED,
 *              out loud, naming both URLs.
 * `no-entry`   the browser has no navigation entry at all (a bfcache restore).
 *
 * A refusal the reader can act on is worth more than a number they cannot
 * trust. PORTAL-REHYDRATE 1.3: on a path that produces a verdict, an unhandled
 * case must fail rather than fall back to the harmless-looking one.
 */
type ClientReading =
  | {
      kind: "document";
      /** Navigation start to the first response byte. */
      ttfbMs: number;
      /** First byte to the response being fully received. */
      downloadMs: number;
      /** Response received to this component's first effect - hydration. */
      hydrateMs: number;
      /** Navigation start to that same effect. The number the owner actually felt. */
      totalMs: number;
    }
  | { kind: "soft-nav"; documentUrl: string; currentUrl: string }
  | { kind: "no-entry" };

/**
 * Does the navigation entry describe the page we are looking at?
 *
 * COMPARED WITHOUT THE HASH, and that is not a detail: the panel carries an
 * anchor (`#medicao`) so it can be linked to, and following that anchor changes
 * `location.href` without changing the document. Comparing the raw strings would
 * make the panel refuse to report on the very page it had just been scrolled to.
 *
 * Exported for the unit test; a browser is not needed to check a URL rule.
 */
export function classifyNavigation(entryUrl: string | null, currentUrl: string): "document" | "soft-nav" | "no-entry" {
  if (entryUrl === null) return "no-entry";
  const strip = (u: string): string | null => {
    try {
      const parsed = new URL(u);
      return `${parsed.origin}${parsed.pathname}${parsed.search}`;
    } catch {
      return null;
    }
  };
  const a = strip(entryUrl);
  const b = strip(currentUrl);
  // AN UNPARSEABLE URL IS NOT "the same page". It is a case nobody planned for,
  // and the safe answer on a verdict path is to refuse rather than to report.
  if (a === null || b === null) return "soft-nav";
  return a === b ? "document" : "soft-nav";
}

function readClientTiming(): ClientReading {
  const nav = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  const verdict = classifyNavigation(nav?.name ?? null, window.location.href);
  if (verdict === "no-entry") return { kind: "no-entry" };
  if (verdict === "soft-nav") {
    return { kind: "soft-nav", documentUrl: nav!.name, currentUrl: window.location.href };
  }
  const now = performance.now();
  return {
    kind: "document",
    ttfbMs: round(nav!.responseStart),
    downloadMs: round(nav!.responseEnd - nav!.responseStart),
    hydrateMs: round(now - nav!.responseEnd),
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
  // `null` is a FOURTH thing and it is not one of the three verdicts: the effect
  // has not run yet (server render, first paint). The face says nothing about
  // the navigation until it has an answer, rather than guessing one.
  const [client, setClient] = useState<ClientReading | null>(null);
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

  /**
   * THE NAVIGATION VERDICT ON THE FACE, not only inside the table.
   *
   * The owner should not have to remember HOW he reached this page in order to
   * know whether the numbers on it mean anything. He reached /patients by
   * clicking the sidebar once already and the rule did not survive the click.
   * So the strip says which kind of load this was, before it is opened.
   */
  const badge =
    client === null
      ? null
      : client.kind === "document"
        ? { text: "carregamento completo", tone: "text-v2-green-700" }
        : client.kind === "soft-nav"
          ? { text: "NAVEGAÇÃO INTERNA · sem medição de cliente", tone: "text-v2-burgundy-700 font-semibold" }
          : { text: "sem entrada de navegação", tone: "text-v2-burgundy-700" };

  return (
    <section
      id="medicao"
      aria-label="Medição de desempenho"
      className="scroll-mt-4 rounded-v2 border border-v2-border bg-surface-muted/60 text-xs text-v2-text-secondary"
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
          {badge ? (
            <>
              {" · "}
              <span className={badge.tone}>{badge.text}</span>
            </>
          ) : null}
          {/* THE FELT TOTAL IS PRINTED ONLY WHEN IT DESCRIBES THIS DOCUMENT.
              On a soft navigation it is the age of the tab, which is exactly
              the shape of the number we are hunting - so it is not shown at
              all rather than shown with a caveat somebody has to notice. */}
          {client?.kind === "document" ? ` · total sentido ${client.totalMs} ms` : ""}
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
              {client?.kind === "document" ? (
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
              ) : null}

              {/* THE REFUSAL. It names both URLs, because "this reading belongs
                  to another page" is only actionable if you can see WHICH. */}
              {client?.kind === "soft-nav" ? (
                <tr>
                  <td className={cell} colSpan={3} data-testid="timing-panel-soft-nav">
                    <strong className="text-v2-burgundy-700">
                      Sem medição do cliente: chegou aqui por navegação interna.
                    </strong>{" "}
                    Os tempos do browser pertencem ao documento carregado em{" "}
                    <code>{client.documentUrl}</code>, não a <code>{client.currentUrl}</code>, e seriam
                    lidos como se fossem desta página.{" "}
                    <strong>
                      Recarregue esta página (ou escreva o endereço) para obter uma medição válida.
                    </strong>{" "}
                    Os tempos do servidor abaixo são desta página e continuam válidos.
                  </td>
                </tr>
              ) : null}

              {client?.kind === "no-entry" ? (
                <tr>
                  <td className={cell} colSpan={3}>
                    Sem medição do cliente: este documento não tem entrada de navegação (restauro de
                    cache). Recarregue a página.
                  </td>
                </tr>
              ) : null}

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
