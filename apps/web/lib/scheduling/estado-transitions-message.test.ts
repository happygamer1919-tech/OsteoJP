import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appointmentStatus } from "@osteojp/db";

import { legalEstadoTransitions } from "./estado-transitions";
import type { AppointmentStatusValue } from "./types";

/**
 * T5 F3 (guide finding, #1462): THE REFUSAL MESSAGE IS TIED TO THE TABLE.
 *
 * `appointment.illegalTransition` is what the agenda drawer and the ficha's
 * Estado control show when updateAppointment refuses a move. It said Cancelada
 * was final while `LEGAL` (estado-transitions.ts) has let a cancelled
 * appointment go back to scheduled or confirmed since SCHED-27. Nothing tied
 * the sentence to the map, so the map moved and the sentence did not.
 *
 * THE TIE IS THREE CHECKS ON ONE LIST OF CLAIMS.
 *   1. Every claim is TRUE of the table.
 *   2. The claims are COMPLETE: every move the Estado control refuses is named
 *      by one of them. So a new edge in LEGAL breaks (1) and a removed edge
 *      breaks (2), and either way this file goes red until the claims, and
 *      with them the message, are brought back in line.
 *   3. Both locales SAY every claim, built from that locale's own status labels
 *      (appointment.statusPending and siblings, which the Estado control shows).
 *      And the sentence that names the final states names nothing else, which
 *      is the exact defect reported.
 *
 * Moves INTO `cancelled` are left out of (2) on purpose: Cancelada is never a
 * target of this control (cancelling is its own action), which
 * estado-transitions.test.ts already pins, and a refusal there is not what this
 * message explains.
 *
 * Each checker is proved red on a seeded input below: the message as it read
 * before this fix, and the table as it read before SCHED-27.
 */

type Status = AppointmentStatusValue;

type Claims = {
  /** No onward move from the Estado control. */
  final: readonly Status[];
  /** `from` may never go back to `to`. */
  neverBackTo: readonly (readonly [Status, Status])[];
  /** `from` may go to these targets and nothing else. */
  onlyBackTo: readonly (readonly [Status, readonly Status[]])[];
};

const CLAIMS: Claims = {
  final: ["completed", "no_show"],
  neverBackTo: [["confirmed", "scheduled"]],
  onlyBackTo: [["cancelled", ["scheduled", "confirmed"]]],
};

const ALL = appointmentStatus.enumValues as readonly Status[];

/** What is untrue or missing about `claims` against a transition table. */
function claimProblems(claims: Claims, legal: (from: Status) => readonly Status[]): string[] {
  const problems: string[] = [];
  const isLegal = (from: Status, to: Status) => legal(from).includes(to);

  // 1. TRUE.
  for (const s of claims.final) {
    if (legal(s).length > 0) problems.push(`"${s}" is claimed final but may go to ${legal(s).join(", ")}`);
  }
  for (const [from, to] of claims.neverBackTo) {
    if (isLegal(from, to)) problems.push(`"${from}" is claimed never to go back to "${to}" but may`);
  }
  for (const [from, targets] of claims.onlyBackTo) {
    const actual = [...legal(from)].sort();
    const claimed = [...targets].sort();
    if (actual.join() !== claimed.join()) {
      problems.push(`"${from}" is claimed to go only to ${claimed.join(", ")} but goes to ${actual.join(", ") || "nothing"}`);
    }
  }

  // 2. COMPLETE.
  const covered = (from: Status, to: Status) =>
    claims.final.includes(from) ||
    claims.neverBackTo.some(([f, t]) => f === from && t === to) ||
    claims.onlyBackTo.some(([f, targets]) => f === from && !targets.includes(to));
  for (const from of ALL) {
    for (const to of ALL) {
      if (to === from || to === "cancelled") continue;
      if (!isLegal(from, to) && !covered(from, to)) {
        problems.push(`the refused move "${from}" -> "${to}" is named by no claim`);
      }
    }
  }
  return problems;
}

type Locale = "pt" | "en";

const I18N = join(__dirname, "..", "..", "..", "..", "packages", "i18n", "src");
const dict = (locale: Locale) =>
  JSON.parse(readFileSync(join(I18N, `strings.${locale}.json`), "utf8")) as Record<string, string>;

/** The label the Estado control shows for each state, per locale. */
function labels(locale: Locale): Record<Status, string> {
  const d = dict(locale);
  return {
    scheduled: d["appointment.statusPending"]!,
    confirmed: d["appointment.statusConfirmed"]!,
    completed: d["appointment.statusCompleted"]!,
    cancelled: d["appointment.statusCancelled"]!,
    no_show: d["appointment.statusNoShow"]!,
  };
}

/** How each locale words each kind of claim. */
const GRAMMAR: Record<
  Locale,
  {
    and: string;
    or: string;
    final: (list: string) => string;
    finalMarker: string;
    neverBack: (from: string, to: string) => string;
    onlyBack: (from: string, list: string) => string;
  }
> = {
  pt: {
    and: " e ",
    or: " ou ",
    final: (list) => `${list} são estados finais`,
    finalMarker: "estados finais",
    neverBack: (from, to) => `uma marcação ${from} não volta a ${to}`,
    onlyBack: (from, list) => `uma marcação ${from} só pode voltar a ${list}`,
  },
  en: {
    and: " and ",
    or: " or ",
    final: (list) => `${list} are final`,
    finalMarker: "are final",
    neverBack: (from, to) => `a ${from} appointment cannot return to ${to}`,
    onlyBack: (from, list) => `a ${from} appointment can only return to ${list}`,
  },
};

/** What the message fails to say, or says wrongly, about `claims`. */
function messageProblems(locale: Locale, message: string, claims: Claims): string[] {
  const problems: string[] = [];
  const g = GRAMMAR[locale];
  const label = labels(locale);
  const lower = (x: string) => x.toLowerCase();
  const text = lower(message);
  const says = (phrase: string) => {
    if (!text.includes(lower(phrase))) problems.push(`${locale}: does not say "${phrase}"`);
  };

  says(g.final(claims.final.map((s) => label[s]).join(g.and)));
  for (const [from, to] of claims.neverBackTo) says(g.neverBack(label[from], label[to]));
  for (const [from, targets] of claims.onlyBackTo) says(g.onlyBack(label[from], targets.map((s) => label[s]).join(g.or)));

  // THE REPORTED DEFECT, checked directly: the sentence naming the final states
  // names no other state.
  const finalSentence = text.split(".").find((sentence) => sentence.includes(g.finalMarker));
  if (!finalSentence) {
    problems.push(`${locale}: no sentence says which states are final`);
  } else {
    for (const s of ALL) {
      if (!claims.final.includes(s) && finalSentence.includes(lower(label[s]))) {
        problems.push(`${locale}: the final-states sentence names "${label[s]}", which is not final`);
      }
    }
  }
  return problems;
}

describe("appointment.illegalTransition matches the LEGAL table (T5 F3)", () => {
  it("every claim is true of LEGAL, and every refused move is named by a claim", () => {
    expect(claimProblems(CLAIMS, legalEstadoTransitions)).toEqual([]);
  });

  it.each(["pt", "en"] as const)("the %s message says every claim and calls nothing else final", (locale) => {
    const message = dict(locale)["appointment.illegalTransition"];
    expect(message, `strings.${locale}.json has no appointment.illegalTransition`).toBeTruthy();
    expect(messageProblems(locale, message!, CLAIMS)).toEqual([]);
  });
});

describe("the two checkers are red on the seeded inputs", () => {
  it("the message as it read before this fix is refused in both locales, and for calling Cancelada final", () => {
    const before: Record<Locale, string> = {
      pt: "Mudança de estado não permitida. Uma marcação confirmada não volta a pendente, e concluída, cancelada e falta são estados finais.",
      en: "Status change not allowed. A confirmed appointment cannot return to pending, and completed, cancelled and no-show are final.",
    };
    for (const locale of ["pt", "en"] as const) {
      const problems = messageProblems(locale, before[locale], CLAIMS);
      expect(problems.some((p) => p.includes(`names "${labels(locale).cancelled}"`)), problems.join("\n")).toBe(true);
    }
  });

  it("the table as it read before SCHED-27 (cancelled closed) is refused against these claims", () => {
    const beforeSched27 = (from: Status): readonly Status[] =>
      from === "cancelled" ? [] : legalEstadoTransitions(from);
    const problems = claimProblems(CLAIMS, beforeSched27);
    expect(problems.some((p) => p.includes('"cancelled" is claimed to go only to')), problems.join("\n")).toBe(true);
  });

  it("a table that loses an edge is refused as incomplete", () => {
    const lostEdge = (from: Status): readonly Status[] =>
      from === "scheduled" ? legalEstadoTransitions(from).filter((t) => t !== "completed") : legalEstadoTransitions(from);
    const problems = claimProblems(CLAIMS, lostEdge);
    expect(problems).toContain('the refused move "scheduled" -> "completed" is named by no claim');
  });

  it("a green arm: a message saying every claim in other sentence order passes", () => {
    // Guards the checker against being too tight: the order of the sentences is
    // not part of the rule, only what they say.
    const reordered =
      "Mudança de estado não permitida. Uma marcação cancelada só pode voltar a pendente ou confirmada. Concluída e falta são estados finais. Uma marcação confirmada não volta a pendente.";
    expect(messageProblems("pt", reordered, CLAIMS)).toEqual([]);
  });
});
