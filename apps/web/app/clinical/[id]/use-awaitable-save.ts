"use client";
import { startTransition, useActionState, useRef } from "react";

/**
 * SIGN-CONFIRM-AND-SAVE-FIRST: `useActionState` for a form's save, plus a way to
 * submit that SAME save and wait for its response.
 *
 * Gravar keeps working exactly as before: `formAction` goes on the <form> and
 * `state` / `pending` drive the messages and the button. `saveAndWait` puts one
 * FormData through the same dispatch, so the save a sign runs first is the
 * existing save path (same server action, same queue, same `state`, so its
 * error shows where a Gravar error shows), and it resolves once that save has
 * answered: with its result, or with null when the action threw. React runs
 * the queue's actions one at a time, so a save already in flight finishes
 * before this one starts.
 *
 * `onSaved` runs after every save that answered, Gravar's included, so the
 * caller can move its "last saved" baseline and content fingerprint forward.
 */
export function useAwaitableSave<S extends { ok: boolean }>(
  action: (prev: S, formData: FormData) => Promise<S>,
  initialState: S,
  onSaved?: (result: S, formData: FormData) => void,
) {
  const waiters = useRef(new Map<FormData, (result: S | null) => void>());

  // The casts: `S` is a plain result object, never a promise, so `Awaited<S>`
  // is `S`; TypeScript cannot see that through a type parameter.
  const [state, formAction, pending] = useActionState<S, FormData>(
    async (prev, formData) => {
      const settle = waiters.current.get(formData);
      waiters.current.delete(formData);
      let result: S;
      try {
        result = await action(prev as S, formData);
      } catch (error) {
        settle?.(null);
        throw error;
      }
      onSaved?.(result, formData);
      settle?.(result);
      return result;
    },
    initialState as Awaited<S>,
  );

  const saveAndWait = (formData: FormData): Promise<S | null> =>
    new Promise((resolve) => {
      waiters.current.set(formData, resolve);
      startTransition(() => formAction(formData));
    });

  return { state: state as S, formAction, pending, saveAndWait };
}
