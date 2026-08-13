/* ================================================================== */
/* 0062 — THE PORTAL LOGIN CAN FIND A PATIENT WHOSE NUMBER WAS TYPED  */
/*        BY A HUMAN.                                                  */
/*                                                                    */
/* Closes SEC-otp-linkage-exact-phone-match, which is LAUNCH-BLOCKING */
/* and which stops MOST patients logging in to the portal at all.     */
/* ================================================================== */
/*                                                                    */
/* THE DEFECT, IN TWO LINES OF SHIPPED CODE.                          */
/*   apps/api/lib/auth/patient-linkage.ts:69                          */
/*       eq(patients.phone, phoneE164)      <- EXACT STRING MATCH     */
/*   apps/web/lib/patients/validation.ts:117-124                      */
/*       optionalText() TRIMS and normalizes NOTHING                  */
/*                                                                    */
/*   `patients.phone` is free text. apps/api/lib/notify/phone.ts says */
/*   so in its own header: numbers arrive as "912 345 678",           */
/*   "00351912345678", "+351 912-345-678". The REMINDERS path calls   */
/*   normalizePhonePT on the stored value before sending, precisely   */
/*   because of this. THE LOGIN PATH DID NOT.                         */
/*                                                                    */
/*   A patient stored as "+351 912 345 678" receives the SMS code -   */
/*   the request endpoint never touches the patient table - types it  */
/*   correctly, and is REFUSED, with the same single string a WRONG   */
/*   code produces, because the API collapses all six failure modes   */
/*   into one response so the screen cannot enumerate patients.       */
/*   Decision D removed the password and the magic link. There is no  */
/*   other door.                                                      */
/*                                                                    */
/* ------------------------------------------------------------------ */
/* WHY A SHADOW COLUMN AND NOT A REWRITE OF `phone`.                  */
/* ------------------------------------------------------------------ */
/*                                                                    */
/* OWNER RULING, 2026-08-13: do not rewrite the stored phone strings. */
/*   Those are clinical record data, and the annul-never-delete       */
/*   principle extends to not silently rewriting a field a            */
/*   receptionist typed. `phone` is what a human entered and stays    */
/*   exactly that; `phone_e164` is a DERIVED reading of it.           */
/*                                                                    */
/* WHY GENERATED AND NOT A TRIGGER OR APPLICATION WRITES.             */
/*   A generated column cannot drift from `phone`. Whatever writes    */
/*   the row - the staff form, the portal PATCH, a seed, a backfill,  */
/*   or LAUNCH-03's importer bringing ~10,000 legacy records with a   */
/*   decade of inconsistent formatting - the derived value is         */
/*   recomputed by the database. An application-side write would be   */
/*   correct on the paths we remembered and wrong on the next one     */
/*   somebody adds, which is the vacuous-guard failure mode this      */
/*   project has counted 123 instances of.                            */
/*                                                                    */
/* ------------------------------------------------------------------ */
/* THE EXPRESSION MIRRORS normalizePhonePT EXACTLY, AND A TEST        */
/* PROVES IT RATHER THAN A COMMENT CLAIMING IT.                       */
/* ------------------------------------------------------------------ */
/*                                                                    */
/*   const compact = raw.replace(/[\s.\-()]/g, "");                   */
/*   if      (compact.startsWith("+351"))     sub = compact.slice(4); */
/*   else if (compact.startsWith("00351"))    sub = compact.slice(5); */
/*   else if (/^351\d{9}$/.test(compact))     sub = compact.slice(3); */
/*   else                                     sub = compact;          */
/*   return /^[29]\d{8}$/.test(sub) ? `+351${sub}` : null;            */
/*                                                                    */
/*   TWO IMPLEMENTATIONS OF ONE RULE IS A DIVERGENCE WAITING TO       */
/*   HAPPEN, so apps/api/lib/auth/phone-e164-parity.db.test.ts runs   */
/*   BOTH over one corpus and requires identical answers on every     */
/*   input. That test is hard-required in the skip guard: the day the */
/*   two disagree, CI says so.                                        */
/*                                                                    */
/*   ONE KNOWN BOUNDARY, STATED RATHER THAN DISCOVERED LATER.         */
/*   JavaScript's \s includes Unicode spaces (U+00A0 and friends);    */
/*   POSIX [[:space:]] under this server's collation may not. A       */
/*   number pasted from a document with a non-breaking space could    */
/*   therefore normalize in TypeScript and NOT here. THAT FAILS       */
/*   CLOSED - the patient is refused exactly as they are today, never */
/*   linked to the wrong row - and the read-only pre-check in         */
/*   docs/migration-apply-0062.md COUNTS such rows before the apply.  */
/*   If any exist, the apply halts and they are a second finding.     */
/*                                                                    */
/* ------------------------------------------------------------------ */
/* NOTHING HERE TRUSTS AMBIENT search_path OR EXTENSION LAYOUT.       */
/* ------------------------------------------------------------------ */
/*                                                                    */
/*   The 0061 lesson, in its general form: `practitioner_id WITH =`   */
/*   needed gist_uuid_ops, Postgres resolved the opclass through      */
/*   search_path, and on Supabase extensions live in `extensions`     */
/*   rather than `public` - so the DDL failed with an error that read */
/*   like a missing extension while the extension was present and     */
/*   merely out of scope. CI could not catch it: a `supabase db       */
/*   reset` database has its own extension layout.                    */
/*                                                                    */
/*   THIS MIGRATION RESOLVES THREE THINGS AND EACH IS PINNED:         */
/*     the TABLE      -> written `public.patients`, never `patients`  */
/*     the FUNCTIONS  -> `pg_catalog.regexp_replace` / `pg_catalog.   */
/*                       right`, never bare names                     */
/*     the OPERATORS  -> `||` and `~` are pg_catalog operators, and   */
/*                       the index uses the DEFAULT btree opclass for */
/*                       varchar rather than a named one, so no       */
/*                       opclass lookup happens at all. That is why   */
/*                       there is no DO block here and there was one  */
/*                       in 0061: this DDL has nothing to resolve.    */
/*                                                                    */
/*   No extension is required. No opclass is named. `regexp_replace`  */
/*   and `right` are IMMUTABLE builtins, which is what lets the       */
/*   column be GENERATED ... STORED at all.                           */
/*                                                                    */
/* ------------------------------------------------------------------ */
/* THIS MIGRATION CANNOT FAIL ON EXISTING DATA.                       */
/* ------------------------------------------------------------------ */
/*                                                                    */
/*   Unlike 0061, which added an EXCLUDE constraint that a single     */
/*   colliding pair would refuse outright, this adds a NULLABLE       */
/*   derived column and a NON-UNIQUE index. Every existing row gets a */
/*   value or a NULL; none can reject the DDL. The pre-check          */
/*   therefore measures IMPACT, not feasibility - how many patients   */
/*   this repairs, and whether any are left behind.                   */
/*                                                                    */
/*   THE INDEX IS DELIBERATELY NOT UNIQUE. Two live patients may      */
/*   legitimately share one number - a couple, a parent and child -   */
/*   and the login screen already carries pt-PT copy for exactly that */
/*   case (`otp_shared_number`). resolvePatientByProvenPhone REFUSES  */
/*   on several matches rather than picking one, which is the         */
/*   property that stops a medical record being mis-linked. A unique  */
/*   index would reject real clinic data at write time instead.       */
/* ================================================================== */


/* ------------------------------------------------------------------ */
/* 1. THE DERIVED COLUMN.                                              */
/* ------------------------------------------------------------------ */
/* IF NOT EXISTS so a re-apply is a no-op rather than an error. The    */
/* journal already prevents double application; this is the second     */
/* line of defence, matching 0061's short-circuit.                     */

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS phone_e164 varchar(16)
  GENERATED ALWAYS AS (
    CASE
      /* No number stored: nothing to derive. */
      WHEN phone IS NULL THEN NULL

      /* "+351 912 345 678" -> compact "+351912345678".
         JS takes everything after "+351" and THEN tests the subscriber
         pattern, so "+3519123456789" (ten digits after the prefix) yields
         NULL. Requiring exactly nine here reproduces that. */
      WHEN pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g')
             ~ '^\+351[29][0-9]{8}$'
        THEN '+351' || pg_catalog.right(
               pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g'), 9)

      /* "00351912345678" -> the international 00 prefix. */
      WHEN pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g')
             ~ '^00351[29][0-9]{8}$'
        THEN '+351' || pg_catalog.right(
               pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g'), 9)

      /* "351912345678" -> country code with no + and no 00. JS gates this
         branch on /^351\d{9}$/ (exactly twelve digits) before slicing, so a
         longer string falls through to the else-branch and then fails the
         subscriber test. Requiring exactly twelve here, with the subscriber
         pattern inline, reaches the same answer on every input. */
      WHEN pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g')
             ~ '^351[29][0-9]{8}$'
        THEN '+351' || pg_catalog.right(
               pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g'), 9)

      /* "912 345 678" -> a bare nine-digit subscriber, which is how a
         Portuguese patient writes their own number and how the portal's
         login field is filled in. */
      WHEN pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g')
             ~ '^[29][0-9]{8}$'
        THEN '+351' || pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g')

      /* Anything else - a foreign number, a malformed one, an extension, a
         note someone typed into the field - is NOT a PT subscriber number.
         NULL, exactly as normalizePhonePT returns null, and NEVER a guess.
         A NULL here means "this patient cannot use the portal login", which
         is a fact worth being able to query rather than one to paper over. */
      ELSE NULL
    END
  ) STORED;

COMMENT ON COLUMN public.patients.phone_e164 IS
  'DERIVED, GENERATED ALWAYS from patients.phone. The E.164 reading of the '
  'number a human typed, or NULL when it is not a valid PT subscriber number. '
  'Written by nobody: it is what the portal login matches on '
  '(resolvePatientByProvenPhone). Mirrors normalizePhonePT, and '
  'phone-e164-parity.db.test.ts requires the two to agree. Migration 0062, '
  'SEC-otp-linkage-exact-phone-match.';


/* ------------------------------------------------------------------ */
/* 2. THE INDEX THE LOGIN PATH USES.                                   */
/* ------------------------------------------------------------------ */
/* (tenant_id, phone_e164) in that order, because resolvePatientByProvenPhone */
/* filters on both and tenant_id is the higher-cardinality discriminator      */
/* across the estate. NOT UNIQUE - see the header.                           */
/*                                                                            */
/* NOT `CONCURRENTLY`, deliberately: drizzle-kit runs a migration inside a    */
/* transaction and CREATE INDEX CONCURRENTLY cannot. On a table of this size  */
/* the plain form is instantaneous, and a lock held for that long on an       */
/* apply the owner is watching is not a cost worth engineering around.        */

CREATE INDEX IF NOT EXISTS patients_tenant_phone_e164_idx
  ON public.patients (tenant_id, phone_e164);
