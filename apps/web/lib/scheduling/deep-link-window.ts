import { addDays } from "./time";

/**
 * ITEM 4 - the date window /marcacoes must query so a deep-linked appointment is
 * actually in the list.
 *
 * PURE, AND SPLIT OUT FOR THAT REASON. It is three interacting rules (widen to
 * reach the target, never narrow the user's own range, never exceed the 92-day
 * ceiling) and it lived inline in a server component where nothing could reach
 * it. The arithmetic is the part most likely to be wrong and the easiest to pin.
 */
export function deepLinkWindow(args: {
  /** The range the URL asked for (or the default week). */
  from: string;
  to: string;
  /** The linked appointment's own Lisbon day, or null when there is no link. */
  targetDate: string | null;
  maxWindowDays: number;
}): { from: string; to: string } {
  const { from, to, targetDate, maxWindowDays } = args;
  const clampForward = (start: string) => addDays(start, maxWindowDays - 1);

  if (!targetDate) {
    // No link: the pre-existing behaviour, unchanged.
    return { from, to: to <= clampForward(from) ? to : clampForward(from) };
  }

  // WIDEN, NEVER NARROW. A user who arrived with an explicit ?from/?to keeps
  // every day they asked for; the target is added to that range rather than
  // replacing it.
  const wideFrom = targetDate < from ? targetDate : from;
  const wideTo = targetDate > to ? targetDate : to;
  if (wideTo <= clampForward(wideFrom)) return { from: wideFrom, to: wideTo };

  // THE CEILING STILL BINDS, AND CLAMPING FORWARD WOULD BE WORSE THAN USELESS
  // HERE. A link to an appointment eight months out, clamped to
  // `from + 92 days`, returns a window that provably CANNOT contain the row the
  // link points at: the page would look like it worked and quietly show the
  // wrong three months. Anchoring on the target's own day keeps the promise the
  // notification made, and the user still has the date pickers.
  return { from: targetDate, to: targetDate };
}
