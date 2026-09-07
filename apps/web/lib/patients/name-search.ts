import { sql, type SQL } from "drizzle-orm";
import { patients } from "@osteojp/db";
import { escapeLike } from "./validation";

/**
 * HOW A PATIENT'S NAME IS SEARCHED. ONE RULE, USED BY BOTH SURFACES.
 *
 * ==========================================================================
 * THE INCIDENT: RECEPTION WAS TOLD A PATIENT DOES NOT EXIST
 * ==========================================================================
 * Reproduced on the reported record - Antonio Armando Ribeiro Galhofo, patient
 * 15824, Castelo Branco. Findable by typing the WHOLE name. NOT findable by
 * typing the first name and the surname, which is what a person actually does.
 *
 * Both search surfaces did the same thing:
 *
 *     ilike(patients.fullName, `%${text}%`)
 *
 * ONE substring, the WHOLE typed string, in order. So "Antonio Galhofo" became
 * `%Antonio Galhofo%`, and the stored value has "Armando Ribeiro" in between.
 * The query is correct SQL and it answers a question nobody asked.
 *
 * THE SECOND DEFECT IS IN THE SAME LINE AND WAS INVISIBLE BEHIND THE FIRST.
 * `ILIKE` is case-insensitive and NOT accent-insensitive. `António` and
 * `Antonio` are different strings to it. The clinic's own records carry both
 * spellings of the same people, because they were typed by different people
 * over a decade.
 *
 * AND THE CLIENT-SIDE FILTER ALREADY DISAGREED WITH THE SERVER.
 * `lib/search/text-filter.ts` folds accents (NFD + strip combining marks) and
 * its own header says it is "never a query-semantics change" - correctly, since
 * it filters rows a role has ALREADY read. So the list a reception user typed
 * into behaved one way and the database behaved another, and the database is
 * the one that decides whether a patient exists.
 *
 * ==========================================================================
 * THE RULE
 * ==========================================================================
 * Split the query on whitespace. EVERY token must appear SOMEWHERE in the name,
 * in ANY order, accent-insensitively in BOTH directions.
 *
 * AND, NOT OR, AND THAT IS THE WHOLE SAFETY OF IT. Tokens are ANDed. Two tokens
 * that became an OR would turn "Antonio Galhofo" into "every Antonio plus every
 * Galhofo" - which finds the patient, looks like a fix, and hands reception a
 * list of strangers to pick a medical record from. That is a worse failure than
 * the one being repaired, and `name-search.test.ts` asserts it in both
 * directions rather than trusting this paragraph.
 *
 * ==========================================================================
 * WHY `translate()` AND NOT `unaccent()`
 * ==========================================================================
 * `unaccent` is AVAILABLE on this database and NOT INSTALLED - verified against
 * pg_available_extensions and pg_extension, not assumed. Installing it is
 * `CREATE EXTENSION`, which is a migration, and this fix is not allowed to
 * carry one. `unaccent()` is also not IMMUTABLE (it reads a dictionary file),
 * so it cannot go straight into an index without an IMMUTABLE wrapper anyway.
 *
 * `translate()` is pure, IMMUTABLE and indexable, and the map below is the
 * EXACT set the JavaScript side already folds - derived by running the client's
 * own NFD-strip over the accented Latin-1 range, not typed from memory.
 * `name-search.test.ts` asserts the two agree character by character, because a
 * fold that drifts between client and server rebuilds the defect this file
 * exists to remove.
 *
 * ==========================================================================
 * IT COSTS THE TRIGRAM INDEX, AND THAT IS MEASURED RATHER THAN HOPED
 * ==========================================================================
 * `patients_full_name_trgm_idx` is a GIN trigram index on `full_name`. A bare
 * `full_name ILIKE '%x%'` uses it. `translate(lower(full_name), ...) LIKE '%x%'`
 * CANNOT: the index is on the column, not on the expression.
 *
 * So this fix trades a plan for a correct answer, deliberately and with the
 * numbers on the card. The repair is a functional index on the same expression
 * - which is a migration, proposed and NOT authored here.
 *
 * THE ORDER IS NOT NEGOTIABLE. A search that is fast and tells reception a
 * patient does not exist is not a search. Correct first, then fast.
 */

/**
 * The accent map, lowercase only - `lower()` runs first, so the uppercase half
 * would be dead weight and a second place to drift.
 *
 * DERIVED, NOT TYPED: every pair here is what
 * `c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()` returns
 * for that character, which is exactly what `normalizeSearchText` does in
 * lib/search/text-filter.ts. The test pins the agreement.
 */
const ACCENTED = "áàâãäçéèêëíìîïóòôõöúùûüýÿñ";
const PLAIN = "aaaaaceeeeiiiiooooouuuuyyn";

/** The SQL-side fold, applied to the stored name. */
export const foldedFullName = sql`translate(lower(${patients.fullName}), ${ACCENTED}, ${PLAIN})`;

/**
 * The JS-side fold, applied to the typed token. It must produce the same string
 * the SQL fold would, or a token folds one way and the column the other and the
 * match silently fails - the exact class of defect this file repairs.
 *
 * It is written as the SAME translate table rather than as an NFD strip, so the
 * two implementations cannot diverge for a character one of them handles and
 * the other does not. `text-filter.ts` keeps its NFD form because it is a
 * different job (filtering already-read rows) and the test asserts all three
 * agree over the map.
 */
export function foldNameToken(value: string): string {
  let out = "";
  for (const ch of value.toLowerCase()) {
    const i = ACCENTED.indexOf(ch);
    out += i === -1 ? ch : PLAIN[i];
  }
  return out;
}

/**
 * Split on whitespace and drop empties. Exported for the test, and because the
 * TOKEN COUNT is a fact a caller may want: a two-token query is a materially
 * different question from a one-token query.
 */
export function nameTokens(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0);
}

/**
 * EVERY token must appear somewhere in the folded name. Returns `undefined`
 * when there is nothing to match on, so a caller can tell "no name condition"
 * from "a condition that matches nothing" - those are different answers and
 * collapsing them is how an empty query starts returning the whole table.
 */
export function fullNameMatcher(text: string): SQL | undefined {
  const tokens = nameTokens(text);
  if (tokens.length === 0) return undefined;
  const clauses = tokens.map(
    (t) => sql`${foldedFullName} like ${`%${escapeLike(foldNameToken(t))}%`}`,
  );
  // `and(...)` from drizzle would do, but this keeps the join explicit at the
  // one place the AND-not-OR rule lives.
  return clauses.reduce((acc, c) => sql`${acc} and ${c}`);
}
