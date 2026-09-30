import type { ActionFailure, ActionOutcome } from "@/lib/actions/run-action-core";

import type { DrawerLoad, DrawerPieces, PieceName } from "./drawer-load-core";

/**
 * SKEW-01 PR 2 - THE DRAWER'S SIDE OF THE LOADER.
 *
 * Pure: no React, no Next. The drawer creates one of these when it opens an
 * existing marcacao, and every read the loader covers asks it first:
 *
 *     const covered = preload?.take("noSms", patientId, { value, fallback });
 *     if (!covered) load();   // the read's own action, exactly as before
 *
 * WHO ASKS FIRST. React runs a child's effects before its parent's, so the
 * availability panel and the notes board ask before the drawer's own effects
 * do. The loader therefore starts on the FIRST take, whichever consumer that
 * is, and every later take joins the same request.
 *
 * WHEN A PIECE IS SERVED. Only while the loader has not answered, and only for
 * the key it was loaded for. Once it has answered, or once a consumer asks for
 * a different key (the user changed the patient, the date, the therapist), that
 * piece is spent and every later ask is refused, so the consumer fetches with
 * its own action as it always did. That keeps every refetch the drawer makes
 * after opening (a therapist change, a pacote link, a notes reload) exactly as
 * it was. React's development double-mount asks twice with the same key before
 * any answer, and both asks share the one request.
 *
 * WHAT A FAILURE YIELDS. Never anything new:
 *   - one piece THREW on the server: that consumer runs its own action, so a
 *     failure shows exactly what that read's failure shows today (its toast,
 *     its report, its error line);
 *   - the loader call itself failed (network, skew, a redirect): each consumer
 *     is told the outcome failed, as its own runAction outcome would have told
 *     it, and does what it did then. runAction has already shown the one read
 *     toast, and its "Tentar novamente" re-runs each consumer's own read, which
 *     is what the grouped toast of seven failed reads re-ran before.
 */

export interface PieceConsumer<T> {
  /** The piece's action returned this value. */
  value(v: T): void;
  /** Run the piece's own action, as before the loader existed. */
  fallback(): void;
  /** The loader call failed: what this read did on a failed runAction outcome. Most did nothing. */
  failed?(failure: ActionFailure): void;
}

export interface DrawerPreload {
  /**
   * True when the loader will answer this piece for this key; the consumer then
   * waits for `value`, `fallback` or `failed`. False: fetch it yourself.
   */
  take<K extends PieceName>(name: K, key: string, consumer: PieceConsumer<DrawerPieces[K]>): boolean;
}

/**
 * `start` runs the loader through runAction, with `retry` as the toast's
 * "Tentar novamente". It is called at most once.
 */
export function createDrawerPreload(
  keys: Record<PieceName, string>,
  start: (retry: () => void) => Promise<ActionOutcome<DrawerLoad>>,
): DrawerPreload {
  // The latest consumer per piece. A development remount replaces the first
  // with the second; the first has been cancelled by its own cleanup.
  const consumers = new Map<PieceName, PieceConsumer<never>>();
  // Pieces a consumer has moved off (asked for another key).
  const spent = new Set<PieceName>();
  let started = false;
  let answered = false;

  function live(): Array<[PieceName, PieceConsumer<never>]> {
    return [...consumers].filter(([name]) => !spent.has(name));
  }

  function retry(): void {
    // The toast's button: each consumer that is still waiting runs its own
    // read, which carries its own retry from here on.
    for (const [name, consumer] of live()) {
      spent.add(name);
      consumer.fallback();
    }
  }

  function answer(outcome: ActionOutcome<DrawerLoad>): void {
    answered = true;
    if (outcome.failed) {
      for (const [, consumer] of live()) consumer.failed?.(outcome.failure);
      return;
    }
    for (const [name, consumer] of live()) {
      spent.add(name);
      const piece = outcome.value[name];
      if (piece && piece.status === "ok") (consumer as PieceConsumer<unknown>).value(piece.value);
      else consumer.fallback();
    }
  }

  return {
    take(name, key, consumer) {
      if (answered || spent.has(name)) return false;
      if (key !== keys[name]) {
        spent.add(name);
        consumers.delete(name);
        return false;
      }
      consumers.set(name, consumer as PieceConsumer<never>);
      if (!started) {
        started = true;
        void start(retry).then(answer);
      }
      return true;
    },
  };
}
