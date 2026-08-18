# Apply receipt - migration 0065, `guest_booking_requests` ACL

**Status: APPLIED TO PRODUCTION 2026-08-18. MERGED THE SAME DAY. TRANSCRIPT
COMPLETE.**

The verbatim journal in §5.1 was relayed on 2026-08-18, after this receipt was
first committed. Until then §5.1 was **deliberately empty and said so** rather
than carrying a transcript reconstructed from a summary.

Migration: `0065_guest_requests_acl` (journal idx 64, `when` 1787300000000).
Branch: `db/GUEST-07-0065-guest-acl` (deleted at merge).
PR: **#929, squash-merged as `e28067d`.**
**Applied from sha `17fe9dc`** - orphaned by the squash, see §4.
Applied by the owner from `/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply`.
Cards: `GUEST-07-migration-0065-guest-acl`, closing
`INC-11-guest-requests-no-grant`'s remaining reproducibility half.

**Next free migration number: `0066`. It is unoccupied and NOT authorized.**

Written under `docs/runbook-prod-migrations.md`.

---

## 0. THE APPLY BLOCK WAS REJECTED ONCE, ON DOCTRINE, AND THAT IS THE FIRST THING WORTH RECORDING

The migration content was accepted on the first read. **The block around it was
not**, and all four faults were the same kind: it had been built from the shape
of the previous apply document instead of from
`docs/runbook-prod-migrations.md`, which is the committed source.

| Rejected | Canonical |
|---|---|
| `set -a; . ~/osteojp-secrets/new-prod.env; set +a` | `set -o allexport` + `source /Users/ivan/...` + `set +o allexport`. `set -a` errors in zsh and tilde paths are banned |
| `check-pending-migrations.mjs` called bare | called with the **literal expected count**, `1` before and `0` after |
| no teardown | `unset DATABASE_URL DATABASE_URL_DIRECT`, then **close the terminal window** |
| pre-flight folded into the apply | pre-flight is **its own separate paste**, read before any credential is sourced |

**The lesson generalises past this file.** A runbook that exists but is not read
is the same as a runbook that does not exist. The 0058-0062 documents were
correct *because* strategy pasted the canonical block each time - the discipline
lived in the paste, not in the author - and the moment an author worked from a
sibling document instead, three of the four steps silently reverted to an older
form. The runbook was committed on 2026-08-15 for exactly this reason and this
is the first apply that proves the failure mode is real.

---

## 1. What this migration does

**No schema change. No column, no index, no policy, no data.** Three statements:

```
GRANT SELECT, UPDATE ON public.guest_booking_requests TO authenticated;
REVOKE INSERT, DELETE, REFERENCES, TRIGGER, TRUNCATE ON public.guest_booking_requests FROM authenticated;
REVOKE ALL ON public.guest_booking_requests FROM patient;
```

It closes a gap that ran in **both directions at once**. 0063 created the table
and granted nothing, so a database built from the committed files gives
`authenticated` no access at all - CI proved it on 2026-08-17 with a `42501`.
Production meanwhile held **seven** privileges on that table, none of them
granted by any migration: they came from the platform's DEFAULT PRIVILEGES,
applied at `CREATE TABLE`. The committed schema granted too little to work;
production granted more than anyone had chosen.

**RLS is untouched.** Not one policy changes. Production's extra privileges were
bounded by 0063's policies the whole time, which is why `INC-11` closed as a
reproducibility defect rather than an incident.

---

## 2. The verification done BEFORE authoring, which is what makes the revokes safe

The ruling required a code read proving no `authenticated` path relies on any
revoked privilege, and a HALT if one did. Every reference to the table in the
repository, classified by the role it runs as:

| Path | Role | Operation |
|---|---|---|
| `apps/web/lib/scheduling/guest-requests.ts` | `authenticated` (`runScoped`) | SELECT x2 |
| `apps/web/lib/scheduling/guest-convert.ts` (#917) | `authenticated` (`runScoped`) | UPDATE x1 |
| `apps/api/app/api/v1/booking/guest/route.ts` | **service role** | INSERT x1 |
| `packages/db/tests/guest-phone-parity.db.test.ts` | privileged connection | DELETE (teardown) |
| `apps/portal/proxy.ts`, `apps/portal/lib/guest/api.ts`, `packages/db/src/guest-preferred-window.ts` | - | comments only |

**The test teardown was the one that could have been a halt, and it is not one.**
`connect()` in `rls-harness.ts` returns a raw client on the privileged URL and
that suite never enters the role-switching helper, so its `DELETE` does not run
as `authenticated`. Checked rather than assumed, because "nothing uses it" is the
claim this entire migration rests on.

**The service-role INSERT was confirmed the same way**: the guest route uses the
base client and calls `withTenantContext` **zero** times. That is what makes
revoking INSERT safe rather than merely plausible.

No foreign key points at this table, so `REFERENCES` granted a capability nobody
asked for; nothing creates triggers at runtime.

---

## 3. Why the proof shape is the ACL itself, not a table check

Every prior receipt verifies with `check-migration-tables.mjs` or
`check-migration-columns.mjs`: the migration creates an object, and the object's
existence is the evidence.

**0065 creates no object.** No table, no column, no policy, no row. There is
nothing whose existence could prove it ran, and `drizzle-kit migrate` prints
`migrations applied successfully` whether or not it applied anything - that is
how 0058 produced a success over a no-op.

So the privilege list **is** the schema change, and it is read on both sides of
the apply with `packages/db/scripts/check-guest-requests-grant.mjs`, the same
read-only script that closed INC-11. Before and after, not after alone: an
"after" reading with nothing to compare against cannot distinguish a successful
apply from a database that already looked like that.

---

## 4. THE PINNED SHA IS ORPHANED. Read this before trying to verify §5.

`17fe9dc` **will not resolve in a fresh clone.** It sat on
`db/GUEST-07-0065-guest-acl`; #929 was squash-merged, so that branch's commits
never became ancestors of `main`, and the branch was deleted at merge. Checked,
not assumed: `git merge-base --is-ancestor 17fe9dcc origin/main` exits non-zero
today.

Pin all three, per the rule `docs/migration-apply-0063.md` §4 established:

| Ref | Blob for `packages/db/migrations/0065_guest_requests_acl.sql` |
|---|---|
| `17fe9dc` (applied) | `b85a605a1a738cd05bc562f4ffdb9252fdb9fbf0` |
| `e28067d` (squash merge of #929) | `b85a605a1a738cd05bc562f4ffdb9252fdb9fbf0` |
| `origin/main` | `b85a605a1a738cd05bc562f4ffdb9252fdb9fbf0` |

`meta/_journal.json` is byte-identical across all three
(`349b830b7b3359fab8dccef4581eb76563e03896`).

**So what ran against production is byte-identical to what is on `main` today**,
checkable from any clone:

```
git rev-parse origin/main:packages/db/migrations/0065_guest_requests_acl.sql
```

---

## 5. THE APPLY. 2026-08-18.

### 5.1 The transcript. Verbatim, as pasted back by the owner.

```
HEAD is now at 17fe9dc feat(db): migration 0065 normalises the guest table ACL [DO NOT MERGE - apply first]
=== public.guest_booking_requests ===
RLS enabled: true | forced: false
grants:
  authenticated  DELETE
  authenticated  INSERT
  authenticated  REFERENCES
  authenticated  SELECT
  authenticated  TRIGGER
  authenticated  TRUNCATE
  authenticated  UPDATE
  service_role   DELETE
  service_role   INSERT
  service_role   REFERENCES
  service_role   SELECT
  service_role   TRIGGER
  service_role   TRUNCATE
  service_role   UPDATE
=== control: public.staff_notifications (0055 granted explicitly) ===
  authenticated: INSERT, REFERENCES, SELECT, TRIGGER, UPDATE
=== VERDICT ===
PRODUCTION IS FINE. authenticated holds SELECT and UPDATE.
The committed migration is still wrong and CI still fails:
prod got these grants from somewhere other than 0063 (most
likely Supabase default privileges at table creation). The
GRANT migration is then a CI-and-correctness fix, not an incident.
last applied "when" in the database: 1787200000000
journal entries on disk:             65
pending:                             1
  PENDING  0065_guest_requests_acl  when=1787300000000
OK: the pending set is exactly what was expected.
[drizzle-kit migrate ran; two expected NOTICE lines: schema
"drizzle" already exists, skipping; relation
"__drizzle_migrations" already exists, skipping]
[checkmark] migrations applied successfully!
last applied "when" in the database: 1787300000000
journal entries on disk:             65
pending:                             0
OK: the pending set is exactly what was expected.
=== public.guest_booking_requests ===
RLS enabled: true | forced: false
grants:
  authenticated  SELECT
  authenticated  UPDATE
  service_role   DELETE
  service_role   INSERT
  service_role   REFERENCES
  service_role   SELECT
  service_role   TRIGGER
  service_role   TRUNCATE
  service_role   UPDATE
=== control: public.staff_notifications (0055 granted explicitly) ===
  authenticated: INSERT, REFERENCES, SELECT, TRIGGER, UPDATE
=== VERDICT ===
PRODUCTION IS FINE. authenticated holds SELECT and UPDATE.
The committed migration is still wrong and CI still fails:
prod got these grants from somewhere other than 0063 (most
likely Supabase default privileges at table creation). The
GRANT migration is then a CI-and-correctness fix, not an incident.
```

**THE TWO VERDICT BLOCKS SHOW THE SCRIPT'S PRE-FIX WORDING, AND IT STAYS.** Both
say *"The committed migration is still wrong and CI still fails"* - which was true
when the script was written and was already false by the time the second block
printed, seconds after the apply. The verdict had only one arm for
"SELECT and UPDATE are present" and could not tell the pre-0065 state from the
post-0065 one.

It was corrected in **#930**, after this apply, and now distinguishes them: the
end state prints *"CORRECT. authenticated holds SELECT and UPDATE, and nothing
else"*, while the old state prints *"WORKS, BUT OVER-PRIVILEGED"* and names the
extra privileges. **The stale wording is not edited out of this transcript.** It
is part of the verbatim record, it is what the terminal actually printed, and a
receipt that quietly improved its own evidence would be worth nothing. The
correction is recorded here instead, which is the honest form.

### 5.1a What the two grant blocks prove, which is the whole point of reading them

**BEFORE:** `authenticated` holds **seven** privileges - DELETE, INSERT,
REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE. No migration granted any of them.

**AFTER:** `authenticated` holds **two** - SELECT and UPDATE. Exactly what
`apps/web/lib/scheduling/guest-requests.ts` reads with and what
`guest-convert.ts` updates with, and nothing else.

**`service_role` is IDENTICAL in both blocks**, all seven, untouched. That is the
control that matters most: the public form writes through the service role, so if
this migration had caught the wrong grantee, the guest form at `/marcacao` would
have stopped accepting requests. It did not.

**RLS reads `enabled: true` in both**, and `forced: false` in both. No policy was
touched and none should have been.

**AND THE CONTROL TABLE DID NOT MOVE.** `staff_notifications` prints the same
five privileges before and after - INSERT, REFERENCES, SELECT, TRIGGER, UPDATE -
which is what 0055 granted explicitly. A migration that had reached beyond its
own table would show up here, and it does not.

### 5.2 What is verified independently, and does not depend on the transcript

Re-derived from `origin/main` by the terminal writing this file, **before the
transcript above was available** - so these are checks of the apply, not readings
of the paste:

| Transcript says | Committed repo says | Agrees |
|---|---|---|
| `when` moved to `1787300000000` | journal's last entry is `when 1787300000000` | yes |
| pending was `0065_guest_requests_acl` | last entry `tag` is exactly that | yes |
| journal entries | 65 on disk, `idx` 64 last, contiguous | yes |
| after-grants: SELECT + UPDATE only | precisely what the committed SQL grants and revokes | yes |

The prod-apply worktree was also observed parked at `17fe9dc` - the fingerprint
the runbook's `git checkout --detach <sha>` leaves behind - which corroborates
the sha the apply ran from without depending on anyone's report of it.

**What cannot be verified from here, and is not claimed:** the state of the
production ACL itself. This terminal never connects to production (standing rule
1). The after-grant reading is the owner's, taken with the committed read-only
script, and it is evidence because of what the script does, not because of who
relayed it.

---

## 6. What this does NOT cover

- **It changes no behaviour in production.** The privileges it grants were
  already present there. What it fixes is that a database built from the
  committed files now matches, and that `authenticated` no longer holds five
  privileges nobody chose.
- **It does not close the wider finding.** Supabase's default privileges grant
  broadly at `CREATE TABLE` across every table in this project, not just this
  one. That is appended to `END-legal-sweep` for the cybersecurity engagement as
  a configuration review, and one table's correction is not it.
