"use client";

import { useMemo, useState, type ReactNode } from "react";

import { matchesName } from "@/lib/admin/roster-filter";
import { s } from "@/lib/i18n";

/**
 * SCHED-03 - the /horarios roster filter.
 *
 * CLIENT-SIDE, AND THE WHOLE ROSTER IS ALREADY ON THE PAGE. The cards are
 * rendered on the SERVER and passed through here as `ReactNode`; this component
 * decides which of them are displayed and does nothing else. No fetch, no
 * server round trip, no re-render of a card.
 *
 * WHY THAT MATTERS RATHER THAN BEING AN IMPLEMENTATION DETAIL: each card owns
 * live editor state - a half-typed time in `WeekScheduleEditor`, an open
 * `AlternatingWeeksPanel`, a block dialog mid-edit. A server-side filter would
 * remount them and silently discard whatever was being typed. Filtering by
 * display keeps every card mounted and every unsaved edit intact, so the search
 * box cannot cost somebody their work.
 *
 * IT GRANTS NO AUTHORITY. Which therapists exist in this list was decided
 * server-side by `resolveScheduleScope` before anything reached the browser, and
 * every write still goes through the `schedule:manage` + own-location gates.
 * This narrows a list; it does not widen one.
 *
 * THE CARDS ARE UNTOUCHED. No prop of theirs changes, nothing is re-ordered, and
 * a roster with the search box empty renders exactly what it rendered before
 * this component existed.
 */
export function RosterSearch({
  cards,
}: {
  cards: { id: string; name: string; card: ReactNode }[];
}) {
  const [query, setQuery] = useState("");

  // A SET OF IDS, NOT A FILTERED LIST, and the difference is load-bearing - see
  // the mounting note above. Every card is rendered on every keystroke; this
  // decides only which ones are HIDDEN. Filtering the array instead would remove
  // the non-matching cards from the React tree, unmount their editors, and throw
  // away whatever was half-typed in them.
  const matching = useMemo(
    () => new Set(cards.filter((c) => matchesName(c.name, query)).map((c) => c.id)),
    [cards, query],
  );

  // THE BOX APPEARS ONLY WHEN IT IS USEFUL. Below four cards the whole roster is
  // on one screen and a search field is a control that costs a glance and saves
  // nothing - and on a single-therapist roster (a therapist viewing their own,
  // which is what the self scope produces) it would be actively odd.
  const showSearch = cards.length >= 4;

  return (
    <div className="flex flex-col gap-4">
      {showSearch && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={s["schedule.searchPlaceholder"]}
            aria-label={s["schedule.searchLabel"]}
            data-testid="roster-search"
            className="h-11 min-w-0 flex-1 rounded-v2 border border-v2-border bg-surface-base px-3 text-sm text-v2-text-primary placeholder:text-v2-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          />
          {/* THE COUNT IS ALWAYS SHOWN, not only while filtering. A number that
              appears and disappears is a second thing to notice; a number that
              is always there is read once and then trusted. */}
          <span className="text-sm text-v2-text-secondary" data-testid="roster-count">
            {matching.size === cards.length
              ? `${cards.length}`
              : `${matching.size}/${cards.length}`}
          </span>
        </div>
      )}

      {/* LOADED-AND-EMPTY GETS ITS OWN WORDS. INC-05's rule: a blank region
          reads as a broken page, and here it would read as "this clinic has no
          therapists" - false and alarming - rather than as "nobody is called
          that". */}
      {matching.size === 0 && (
        <p
          className="rounded-v2 border border-v2-border bg-surface-muted px-4 py-6 text-center text-sm text-v2-text-secondary"
          data-testid="roster-no-match"
        >
          {s["schedule.searchNoMatch"]}
        </p>
      )}

      {cards.map((c) => (
        <div key={c.id} hidden={!matching.has(c.id)}>
          {c.card}
        </div>
      ))}
    </div>
  );
}
