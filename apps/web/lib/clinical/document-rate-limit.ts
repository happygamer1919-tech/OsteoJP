import "server-only";
import {
  RULES,
  checkDurableRateLimit,
  subjectKey,
  createDurableRateLimitStore,
} from "@osteojp/rate-limit";

/**
 * SEC-web-surface-limiter-adoption, ROUTE 6: staff document generation.
 *
 * ==========================================================================
 * ONE HELPER AND NOT THREE COPIES, FOR THE REASON THE PACKAGE ITSELF EXISTS
 * ==========================================================================
 * Three call sites share this - `downloadReportUrlAction`,
 * `generateRgpdFormUrlAction` and `generateDeclaracaoUrlAction`. The rate-limit
 * package's own header records why a security control must not be copied: "two
 * copies drift, and the drift is silent - nobody would know which app enforced
 * what until an incident asked." Three copies of a bucket-key derivation would
 * be the same defect one layer down, and the failure would be that one of the
 * three documents quietly had no ceiling.
 *
 * ==========================================================================
 * WHY THESE THREE ACTIONS AND NOT THE REST OF THE AUTHENTICATED SURFACE
 * ==========================================================================
 * Each call RENDERS A PDF and writes a NEW PERMANENT OBJECT to Storage under a
 * `randomUUID()` path. The `upsert: true` on those uploads is inert, because a
 * fresh UUID never collides: nothing is overwritten and nothing cleans up. That
 * makes their cost cumulative and permanent, which ordinary staff CRUD is not -
 * a receptionist editing a patient a thousand times has changed ONE row a
 * thousand times and written a thousand audit rows against their own name.
 *
 * ==========================================================================
 * IT BOUNDS A BURST. IT DOES NOT BOUND ACCUMULATION, AND THAT IS THE BIGGER
 * PROBLEM.
 * ==========================================================================
 * Twenty legitimate declarations a day is ~7,000 permanent PDFs a year, and
 * every one of them is somebody doing their job. NOTHING HERE ADDRESSES THAT.
 * What this stops is a runaway client loop or a compromised session generating
 * thousands in minutes. The accumulation needs a storage lifecycle decision,
 * which is the owner's, and it is carded rather than implied.
 */

/**
 * Two windows, per STAFF USER. `true` means proceed.
 *
 * THE SUBJECT IS THE USER ID, NOT THE SOURCE ADDRESS, and this is the first
 * limited route in the repo whose caller is a known named principal. The id
 * survives an address change and is what `audit_log.actor_user_id` already
 * records, so a refusal in `rate_limit_counters` can be lined up against what
 * that account actually did. An address key would do neither and would throttle
 * a whole clinic behind one NAT.
 *
 * IT FAILS CLOSED, INHERITED FROM `checkDurableRateLimit`, AND THAT COSTS
 * NOTHING HERE. If the database is unreachable the store throws and the limiter
 * REFUSES rather than allowing - which on the face of it means a database blip
 * stops staff printing a declaration. It does not, because ALL THREE ACTIONS
 * READ THE DATABASE TO BUILD THEIR DOCUMENT: the report and RGPD engines load
 * the clinical record, and declaracao/generate.ts loads the location contacts.
 * With no database there is no document to produce either way, so failing
 * closed makes the call fail EARLIER, not more often.
 *
 * Stated because the opposite conclusion is the natural one to draw from
 * durable-store.ts's own header, which justifies fail-closed by the OTP verify
 * path. That justification does not transfer to this route - there is no
 * guessing budget here - and the correct one is the paragraph above.
 *
 * IT TAKES NO HEADERS, AND THE FIRST CUT DID. `clientKeyFromHeaders`
 * short-circuits on a subject before reading a single header, so the argument
 * was never consumed - it existed only to satisfy a parameter, and calling
 * Next's `headers()` to produce it broke seven existing declaracao tests that
 * invoke the action outside a request scope. `subjectKey` is the honest call.
 *
 * CALL IT AFTER THE CAPABILITY CHECK AND AFTER THE INPUT-SHAPE CHECK. The same
 * ordering the staff login settled on, for the same reason: a caller must not be
 * able to spend a real person's allowance with submissions that were never going
 * to produce a document.
 */
export async function documentGenerationAllowed(userId: string): Promise<boolean> {
  const store = createDurableRateLimitStore();

  const perMinute = await checkDurableRateLimit(
    subjectKey("staff_doc_gen", userId),
    RULES.staffDocumentGeneration,
    store,
  );
  if (!perMinute.ok) return refuse();

  const perHour = await checkDurableRateLimit(
    subjectKey("staff_doc_gen_hour", userId),
    RULES.staffDocumentGenerationHour,
    store,
  );
  if (!perHour.ok) return refuse();

  return true;
}

/**
 * THE REFUSAL IS LOGGED BECAUSE THE CALLER CANNOT REPORT IT.
 *
 * All three actions return `{ url: null }` for every failure - not found, not
 * printable, render error - and a throttled call now joins that set. That is a
 * deliberate consistency choice and it has a NAMED COST: on screen, a throttled
 * member of staff sees exactly what a failed render looks like. Changing the
 * return shape would mean a discriminated result threaded through three client
 * components, which is a bigger change than this control is worth.
 *
 * PORTAL-REHYDRATE 1.3 IS WHY THIS LOG LINE EXISTS RATHER THAN BEING OPTIONAL.
 * Mapping a new case onto an existing harmless-looking one is precisely the
 * convenience that section forbids on any path that produces a verdict. The
 * cases are collapsed on the SCREEN and must therefore be distinguishable
 * SOMEWHERE, or "the limiter fired" and "the PDF engine broke" become the same
 * event forever.
 *
 * NO IDENTIFIER IS LOGGED, deliberately. The durable store already holds the
 * bucket key, so whoever investigates can read WHO from there; the log only has
 * to establish THAT it happened and when. A log line is the wrong place to put
 * an identity that is already recorded somewhere access-controlled.
 */
function refuse(): false {
  console.warn(
    "[rate-limit] staff document generation refused: per-user ceiling reached. " +
      "The account is in rate_limit_counters under the staff_doc_gen keys.",
  );
  return false;
}
