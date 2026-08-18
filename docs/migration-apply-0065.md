# Apply receipt - migration 0065, `guest_booking_requests` ACL

**Status: APPLIED TO PRODUCTION 2026-08-18. MERGED THE SAME DAY.**

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

### 5.1 The verbatim transcript is NOT YET IN THIS FILE, and it is not being reconstructed

**What this receipt has** is a structured summary of the apply, relayed by
strategy: before-grants showing all seven `authenticated` privileges; pending 1
naming `0065_guest_requests_acl`; migrate succeeding with the two expected
NOTICE lines; `when` moving to `1787300000000`; pending 0; after-grants showing
`authenticated` with SELECT and UPDATE only, `service_role` intact, and RLS
enabled on both readings. Terminal closed.

**What it does not have is the owner's raw terminal output**, and that is
deliberately left as a gap rather than filled from the summary above.

Every other receipt in this series carries a §5 headed *"Verbatim, as pasted
back by the owner"*. Writing a plausible transcript from a summary would produce
a section indistinguishable from those - the same monospace block, the same
shape - while being a reconstruction. That is precisely the error
`ACC-13-results-uncommitted` was opened for, where the board and the acceptance
plan disagreed because both were reading inferences rather than records.

**Requested from strategy. When it arrives, it is pasted here verbatim and this
subsection is replaced with the check-against-the-repo table §5.3 describes.**
The evidence in §4 and §5.2 stands on its own in the meantime and needs no
transcript: it is derived from the committed repository.

### 5.2 What is verified independently, and does not depend on the transcript

Re-derived from `origin/main` by the terminal writing this file:

| Reported | Committed repo says | Agrees |
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
