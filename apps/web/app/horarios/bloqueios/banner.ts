import { s } from "@/lib/i18n";

/**
 * The one sentence a Bloqueios write comes back with (`?m=` from actions.ts).
 * Each refusal names its own repair; an unknown code is the generic error,
 * never silence.
 */
export function bannerFor(m: string | undefined): { tone: "ok" | "err"; text: string } | null {
  if (!m) return null;
  if (m === "ok") return { tone: "ok", text: s["blocks.saved"] };
  const warn = /^warn:(\d+)$/.exec(m);
  if (warn) return { tone: "ok", text: s["blocks.warnOverlaps"].replace("{n}", warn[1]!) };
  switch (m) {
    case "err:duplicate":
      return { tone: "err", text: s["blocks.errDuplicate"] };
    case "err:invalid":
      return { tone: "err", text: s["blocks.errInvalid"] };
    case "err:note_required":
      return { tone: "err", text: s["blocks.errNote"] };
    case "err:forbidden":
      return { tone: "err", text: s["blocks.errForbidden"] };
    case "err:not_found":
      return { tone: "err", text: s["blocks.errNotFound"] };
    case "err:unavailable":
      return { tone: "err", text: s["blocks.weeklyUnavailable"] };
    default:
      return m.startsWith("err") ? { tone: "err", text: s["blocks.err"] } : null;
  }
}
