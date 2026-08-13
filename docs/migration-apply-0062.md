# Apply block - migration 0062, the E.164 reading of a phone a human typed

**Status: NOT VALIDATED - STRATEGY REVIEW REQUIRED - DO NOT RUN**

Per `docs/board/PORTAL-REHYDRATE.md` §4.9, every apply block starts under this
banner and **PURPLE never clears its own**. The path is draft -> strategy -> Ivan.

Migration: `0062_patient_phone_e164` (journal idx 61).
Branch: `db/0062-patient-phone-e164`. PR: #888.
**Apply from sha `4adafcf`.**
Card: `SEC-otp-linkage-exact-phone-match` - **LAUNCH-BLOCKING**.

Written under `docs/runbook-prod-migrations.md`, "The pre-check is mandatory".

---

## 1. What this migration does, and why it is launch-blocking

**Most patients cannot log in to the portal today.**

`resolvePatientByProvenPhone` matched `eq(patients.phone, phoneE164)` - an exact
string comparison - against a **free-text** column. `optionalText`
(`apps/web/lib/patients/validation.ts:117-124`) trims it and normalizes nothing,
and `apps/api/lib/notify/phone.ts` says so in its own header: *"numbers arrive as
'912 345 678', '00351912345678', '+351 912-345-678', etc."*

A patient stored as `+351 912 345 678` **receives the SMS code** - the request
endpoint deliberately never touches the patient table - types it correctly, and
is **refused**, with the same single string a *wrong code* produces, because the
API collapses all six failure modes into one response so the login screen cannot
enumerate patients. Decision D removed the password and the magic link. There is
no other door.

**0062 adds `patients.phone_e164`**, `GENERATED ALWAYS AS (...) STORED`, plus a
non-unique index on `(tenant_id, phone_e164)`. The linkage query points at the
derived column.

**`patients.phone` IS NOT REWRITTEN.** Owner ruling, 2026-08-13: it is clinical
record data and the annul-never-delete principle extends to not silently
rewriting a field a receptionist typed.

---

## 2. THIS MIGRATION CANNOT FAIL ON EXISTING DATA, AND THAT CHANGES WHAT THE PRE-CHECK IS FOR

**Unlike 0061**, which added an `EXCLUDE` constraint that a single colliding pair
would refuse outright, this adds a **nullable derived column** and a
**non-unique** index. Every existing row gets a value or a `NULL`; none can
reject the DDL.

**So the pre-check does not ask "will it apply". It asks "what does it repair,
and who is left behind".** Section 3 is still mandatory and the apply still halts
on it, but on a different condition: **any patient it cannot repair is a second
finding**, per the dispatch.

---

## 3. THE PRE-CHECK. Read-only. Run this BEFORE anything in section 6.

It computes the same expression the migration will store, **without writing
anything**, and reports four numbers.

```
SELECT
  count(*) FILTER (WHERE phone IS NOT NULL AND btrim(phone) <> '')
    AS with_a_phone,
  count(*) FILTER (
    WHERE phone IS NOT NULL AND btrim(phone) <> ''
      AND phone !~ '^\+351[29][0-9]{8}$'
  ) AS cannot_log_in_today,
  count(*) FILTER (
    WHERE phone IS NOT NULL AND btrim(phone) <> ''
      AND phone !~ '^\+351[29][0-9]{8}$'
      AND CASE
            WHEN pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g') ~ '^\+351[29][0-9]{8}$' THEN true
            WHEN pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g') ~ '^00351[29][0-9]{8}$' THEN true
            WHEN pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g') ~ '^351[29][0-9]{8}$' THEN true
            WHEN pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g') ~ '^[29][0-9]{8}$' THEN true
            ELSE false
          END
  ) AS repaired_by_0062,
  count(*) FILTER (
    WHERE phone IS NOT NULL AND btrim(phone) <> ''
      AND NOT CASE
            WHEN pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g') ~ '^\+351[29][0-9]{8}$' THEN true
            WHEN pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g') ~ '^00351[29][0-9]{8}$' THEN true
            WHEN pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g') ~ '^351[29][0-9]{8}$' THEN true
            WHEN pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g') ~ '^[29][0-9]{8}$' THEN true
            ELSE false
          END
  ) AS STILL_CANNOT_LOG_IN
FROM public.patients
WHERE deleted_at IS NULL
  AND merged_into_id IS NULL;
```

**IT READS NO PHONE NUMBER OUT.** Four integers, nothing else. No `SELECT phone`,
no sample rows, no identifiers - so no patient number reaches a chat window
(PII rule 7). If a row does need looking at, that is a **second, separate,
deliberate act** by the owner in his own shell, not a value pasted back here.

**`deleted_at IS NULL AND merged_into_id IS NULL`** so the counts describe
patients who can actually log in, matching linkage's own predicates.

### How to read the four numbers

| Column | Meaning |
|---|---|
| `with_a_phone` | live patients with any non-blank number - the denominator |
| `cannot_log_in_today` | **the size of the defect.** Not already bare `+351XXXXXXXXX`, so linkage cannot match them today |
| `repaired_by_0062` | of those, how many this migration fixes |
| `STILL_CANNOT_LOG_IN` | **the halt condition** |

**`cannot_log_in_today` minus `repaired_by_0062` equals `STILL_CANNOT_LOG_IN`
minus the rows that were already fine.** The two middle columns are the impact
statement; the last one is the gate.

### THE GATE

- **`STILL_CANNOT_LOG_IN = 0` -> proceed to section 6.**
- **`STILL_CANNOT_LOG_IN > 0` -> STOP. Do not run section 6.** Report the number.

**Why any non-zero value halts, when the migration itself would still apply
cleanly.** A leftover is one of three things and they are not interchangeable: a
**foreign number** (a real patient this clinic cannot reach by PT SMS - a product
question, not a bug), a **malformed entry** (a note or an extension typed into
the phone field - a data-quality fix), or a **normalization gap** - a character
the TypeScript strips and the SQL does not, or the reverse.

**The third one was suspected and has been measured.** JavaScript's `\s` includes
Unicode spaces and POSIX `[[:space:]]` was not obviously going to match them, so a
**non-breaking space** entry sits in the parity corpus - codepoint 160, verified
as actually present in the source rather than an ordinary space that merely looks
like one - and `phone-e164-parity.db.test.ts` **passes**, so this Postgres strips
it exactly as JavaScript does.

**That measurement was taken in CI, which is not production.** Same major version
and almost certainly the same collation, but "almost certainly" is not a
pre-check - which is the whole reason this count is written as *"how many rows
fail to normalize"* rather than as a whitespace test. **It covers this cause and
every other one at the same time.**

Applying over any leftover would ship a migration believing it fixed the login
while some patients still could not use it, and nobody would find out until one
of them tried.

---

## 4. Pre-flight facts, verified against the machine rather than remembered

| Fact | How it was checked | Value |
|---|---|---|
| Apply worktree | `git worktree list` | `/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply` |
| Env file | directory listing, **name only, never read** | `/Users/ivan/osteojp-secrets/new-prod.env` |
| Apply sha | `git log -n1 -- packages/db/migrations supabase/migrations` | `4adafcf` |
| Migration number | file count + journal tail | `0062`, idx `61` |
| Journal `when` | previous `+100000000` | `1787000000000` (prev `1786900000000`) |
| Journal + mirror | `node scripts/check-journal.mjs` | 62 `.sql`, 62 entries, in order, `when` strictly increasing, **mirror matches by CONTENT** |
| `drizzle-kit` resolves | `ls osteojp-prod-apply/packages/db/node_modules/.bin/drizzle-kit` | present |
| Install needed? | **re-derived, not inherited** - see below | **no** |
| DDL resolves nothing ambient | read of the migration | no extension, no named opclass, `public.` and `pg_catalog.` qualified |

**THE NO-INSTALL CLAIM WAS RE-PROVEN, NOT COPIED FROM 0061.** That doc justified
it by the lockfile at `65d9611` being byte-identical to the worktree's. **It is
no longer identical**: `#883` added `@axe-core/playwright`. So the check was
redone at the level that matters - `diff` of the lockfile between `65d9611` and
`4adafcf` touches **only `apps/web`'s dependency block and an eslint peer
re-resolution**. Nothing in `packages/db`, nothing about drizzle. The block runs
`pnpm --filter @osteojp/db exec drizzle-kit migrate` and nothing else, so a new
`apps/web` devDependency cannot affect it.

**If `drizzle-kit` is ever not found, STOP and say so.** Do not add an install to
the block to get past it.

---

## 5. What the DDL resolves, and why there is no `DO` block this time

**0061's lesson in its general form: do not trust ambient `search_path` or
ambient extension layout for anything the DDL resolves.** 0061 needed
`gist_uuid_ops`, Postgres resolves an opclass through `search_path`, Supabase
keeps extensions in `extensions` rather than `public`, and the failure read like
a missing extension while the extension was present and merely out of scope. CI
could not catch it, because a `supabase db reset` database has its own layout.

**0062 resolves three things and each is pinned:**

| What | How it is pinned |
|---|---|
| the table | written `public.patients`, never bare `patients` |
| the functions | `pg_catalog.regexp_replace`, `pg_catalog.right` |
| the index opclass | **none is named** - the default btree opclass for `varchar`, so no opclass lookup happens at all |

**No extension is required and no opclass is named**, which is why this migration
needs no `DO` block and 0061 did. `regexp_replace` and `right` are `IMMUTABLE`
builtins, which is what permits `GENERATED ... STORED` in the first place.

---

## 6. The block

NOT VALIDATED - STRATEGY REVIEW REQUIRED - DO NOT RUN

```
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply
git fetch origin --prune
git checkout --detach 4adafcf
git log -1 --oneline
set -o allexport
source /Users/ivan/osteojp-secrets/new-prod.env
set +o allexport
pnpm --filter @osteojp/db exec node scripts/check-pending-migrations.mjs 1
pnpm --filter @osteojp/db exec drizzle-kit migrate
pnpm --filter @osteojp/db exec node scripts/check-pending-migrations.mjs 0
unset DATABASE_URL DATABASE_URL_DIRECT
```

**`git checkout --detach <sha>` is load-bearing.** A plain `git checkout <branch>`
is rejected in that worktree, and the fallback leaves it on `main` - where
`db:migrate` finds nothing pending and prints success over a no-op. That is
INC-07, twice.

**STOP IF `check-pending-migrations.mjs 1` FAILS.** It reads drizzle's own
pending calculation. If it does not say exactly one is pending, the tree is not
what this block assumes and nothing below it means anything.

**`set -o allexport`, never `set -a`.** Standing rule; `set -a` errors in zsh.

**NO INSTALL, AND IT IS PROVEN UNNECESSARY** rather than merely unwanted - see
section 4.

**CLOSE THE TERMINAL WINDOW WHEN THE APPLY IS DONE.** The final `unset` names two
variables, but `set -o allexport` exported **every** variable in the env file.
Closing the window is the only complete answer.

**SCAN THE OUTPUT FOR `postgres://` BEFORE PASTING IT BACK.** `drizzle-kit
migrate` can print the connection string on some failures. A leaked connection
string in a pasted block has already cost this project one password rotation.

**WHY `4adafcf`.** It is the last commit touching anything this block executes -
`packages/db/migrations/` (the SQL and the journal) and `supabase/migrations/`
(the mirror). Re-derive with
`git log -n1 -- packages/db/migrations supabase/migrations`. **If this branch is
rebased or the migration body changes, this sha must be updated with it** - 0061's
sha moved twice, and the second time was the dangerous one, because the old sha
still existed and still checked out cleanly while carrying superseded DDL.

---

## 7. What to paste back, and it is five things

1. **the four pre-check numbers** from section 3;
2. the `git log -1 --oneline` line, proving which sha was applied;
3. the **first** `check-pending-migrations` output, showing `pending: 1`;
4. the `drizzle-kit migrate` output;
5. the **second** `check-pending-migrations` output, showing `pending: 0`.

**Items 3 and 5 together are the journal proof.** Neither alone is: a success
message from `migrate` is not evidence that anything ran, which is INC-07 twice
over.

---

## 8. After the apply

**The PR does not merge until item 5 above is pasted back.** Apply-before-merge,
per rule 7. The application code in `#888` queries `phone_e164`; merging it before
the column exists would take the portal login from *refusing most patients* to
*erroring for all of them*.

**The acceptance is already written and runs itself.** The e2e seed's OTP patient
is stored `+351 916 000 005`, with spaces, exactly as a receptionist would type
it, and `portal-otp-login.spec.ts` drives the real login for that patient. It is
green in CI on this branch **because CI applies this migration itself**, so the
fix is proven end to end before production ever sees it.
