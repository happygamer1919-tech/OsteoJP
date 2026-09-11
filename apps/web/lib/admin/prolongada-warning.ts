/**
 * SCHED-23 - THE SENTENCE THAT WAS NOT ON THE FORM.
 *
 * ==========================================================================
 * WHAT HAPPENED, AND WHY A WARNING IS THE FIX RATHER THAN A REFUSAL
 * ==========================================================================
 * Reception opened Bloquear horario, chose "Ausencia prolongada", typed
 * 21/09 to 25/09 and the note "Atende em LV", and pressed Guardar. They meant
 * "JP is working at the LV clinic that week". The system took him off the board
 * at BOTH clinics for five days, and no patient or receptionist could book with
 * him until somebody diagnosed it.
 *
 * Nothing on the form said that would happen. `reasonForMode` maps prolongada to
 * `vacation` without asking, and `resolveWindow` spans midnight to midnight.
 * Both are correct for a real absence, and neither is what was intended here.
 *
 * SO THE WARNING NAMES THE TOOL THEY WERE REACHING FOR. Stating the consequence
 * alone would leave somebody who genuinely needs "at the other clinic this week"
 * with nowhere to go, and they would press through the warning and do the same
 * thing again. The third paragraph is the whole point of the card.
 *
 * IT IS A STEP, NOT A CHECKBOX. A checkbox beside a save button is read past;
 * a panel that replaces the button is not.
 */

/** The three sentences, already interpolated, in the order they are read. */
export type ProlongadaWarning = {
  title: string;
  /** Who, when, and that it is every clinic. */
  scope: string;
  /** What stops working, and what does NOT get destroyed. */
  effect: string;
  /** The tool they were probably reaching for. */
  wrongTool: string;
};

/** "yyyy-mm-dd" -> "dd/mm/yyyy". Local to this module: the warning is prose and
 *  the ISO form belongs in inputs, not in a sentence. */
function pt(date: string): string {
  const [y, m, d] = date.split("-");
  return y && m && d ? `${d}/${m}/${y}` : date;
}

/**
 * Build the warning for one proposed block.
 *
 * TAKES ITS STRINGS RATHER THAN IMPORTING THEM, so the copy stays in the i18n
 * bundle (owner-approved, both locales) and this stays a pure function a test
 * can drive without the dictionary.
 */
export function prolongadaWarning(
  strings: { title: string; scope: string; effect: string; wrongTool: string },
  args: { therapistName: string; startDate: string; endDate: string },
): ProlongadaWarning {
  const fill = (t: string) =>
    t
      .replaceAll("{nome}", args.therapistName)
      .replaceAll("{de}", pt(args.startDate))
      .replaceAll("{ate}", pt(args.endDate || args.startDate));
  return {
    title: strings.title,
    scope: fill(strings.scope),
    effect: fill(strings.effect),
    wrongTool: fill(strings.wrongTool),
  };
}

/**
 * Does this submission need the warning?
 *
 * ONLY `prolongada`. `Bloqueio pontual` and `Bloqueio repetido` are hour ranges
 * on named days: they do not have this blast radius, and warning about them
 * would teach reception to click through the warning that matters.
 *
 * BOTH DATES MUST BE PRESENT, because the warning quotes them. A half-filled
 * form is refused by the server anyway; showing a warning that says "from
 * undefined to undefined" would be worse than showing none.
 */
export function needsProlongadaWarning(input: {
  mode: string;
  startDate: string;
  endDate: string;
}): boolean {
  return input.mode === "prolongada" && input.startDate !== "" && input.endDate !== "";
}
