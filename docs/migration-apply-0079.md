# Apply receipt — migration 0079, service_role and anon lose EXECUTE

**OWNER-RUN. The lane could not apply it: this session's harness refuses to read
`~/osteojp-secrets/new-prod.env`, so SR-50 self-apply cannot be satisfied.** The
target-guard command was denied by the sandbox classifier before any connection
was attempted. No production credential was read, printed or used, and no
connection to production was made from this session.

**Migration:** `0079_revoke_service_role_execute.sql`
**File sha256:** `eb3d48f08b5623a9826aacd43d4fd9173f0444f02ce0e9565e8eeed92df90ada`
— what `drizzle.__drizzle_migrations.hash` must contain afterwards. Comparing it
is the only check that proves the file APPLIED is the file APPROVED.
**Apply from:** `origin/fix/SEC-0079-revoke-service-role-execute`.
**PR:** #1175, which must NOT be merged until this is applied (rule 7).

---

## 1. The two-stage block

Both stages, verbatim. Stage 1 writes nothing; stop after it if any verdict
reads FAIL.

```bash
# ---------- STAGE 1: guard + pre-check. READ-ONLY. ----------
cd /Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply && \
git fetch origin && \
git checkout origin/fix/SEC-0079-revoke-service-role-execute && \
set -o allexport && source /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport && \
node scripts/assert-production-target.mjs && \
psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
     -f scripts/0079-precheck.sql
```

`assert-production-target.mjs` is the INVERTED guard: it refuses anything whose
project ref is not `dfotoodqvmjhbdcxyaxf` or whose port is not `5432`, prints
host, port and ref, and prints no credential. It must exit 0.

The pre-check prints `journal_rows_before`. **Carry that number into stage 2.**
Strategy states it is 76; the check prints it anyway, because a number carried
between dispatches is a claim and a number read out of the database is a fact.

```bash
# ---------- STAGE 2: apply + post-check. ----------
pnpm db:migrate && \
psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -P pager=off \
     -v expected_before=76 \
     -f scripts/0079-postcheck.sql
```

Replace `76` if stage 1 printed something else. **Every verdict in both checks
must read OK.** Any FAIL halts: do not retry, adjust or work around it — report
and stop. Paste both tables back and #1175 gets merged.

---

## 2. Rehearsed, in full, before being handed over

Run against a **non-production** database (the local Supabase stack on 54322)
whose drizzle journal was seeded to production's exact position — 76 rows,
max id 76, 0075 and 0078 applied by hash, 0079 absent — and then migrated
through the real `pnpm db:migrate`, not a hand-run of the SQL.

**Stage 1:**

```
=== THE NUMBER TO CARRY TO THE POST-CHECK AS -v expected_before=<n> ===
 journal_rows_before | max_id
---------------------+--------
                  76 |     76

                 0079 PRE-CHECK - every verdict must read OK
                    check                    | observed | expected | verdict
---------------------------------------------+----------+----------+---------
 journal is at 76 rows                       | 76       | 76       | OK
 0078 is applied (by hash)                   | present  | present  | OK
 0075 is applied (by hash)                   | present  | present  | OK
 0079 is NOT applied yet (by hash)           | absent   | absent   | OK
 service_role CAN still execute (the defect) | 20       | > 0      | OK
 the SECURITY DEFINER set is present         | 21       | >= 20    | OK

=== FOR THE RECORD: who can execute what, BEFORE ===
 service_role | anon | authenticated | patient | null_acls | total
--------------+------+---------------+---------+-----------+-------
           20 |   12 |            20 |      11 |         0 |    21
```

`service_role 20` and `anon 12` reproduce the production measurement on the
card exactly.

**Stage 2:**

```
[✓] migrations applied successfully!

             0079 POST-CHECK - every verdict must read OK
                check                 | observed | expected | verdict
--------------------------------------+----------+----------+---------
 journal = before + 1                 | 77       | 77       | OK
 0079 is applied (by file hash)       | present  | present  | OK
 0078 still applied (by file hash)    | present  | present  | OK
 0075 still applied (by file hash)    | present  | present  | OK
 service_role can execute NONE        | 0        | 0        | OK
 anon can execute NONE                | 0        | 0        | OK
 authenticated keeps the rest         | 18       | 18       | OK
 auth admin keeps the token hook      | true     | true     | OK
 patient keeps the portal three       | 3        | 3        | OK
 no SECURITY DEFINER has a null acl   | 0        | 0        | OK
 0078 policy unchanged                | present  | present  | OK
 0075 reminder_dispatch_tenant intact | present  | present  | OK
(12 rows)
exit 0
```

---

## 3. What the rehearsal caught, which is the reason for doing it

**Both checks identified migrations by `id`, and `id` is not the migration
number.** `drizzle.__drizzle_migrations.id` is a SERIAL — the count of
migrations applied. Up to 0075 the counter and the tag coincided, which is why
`scripts/0075-postcheck.sql` could assert "highest applied id = 75" and be right.

They have diverged permanently: **0076 is reserved and unstarted and 0077 is
released but unwritten**, so the tags jump 0075 → 0078 while the counter does
not. Production has 76 rows and max id 76 with 0078 as the last tag.

The first drafts asserted `max(id) = 78` before and `max(id) = 79` after. Both
would have **failed on a correct apply** and sent the owner into a halt on a
migration that had worked. Identity is now the file's sha256, which is what
drizzle stores in `hash`; the counter is used only for the `before + 1`
arithmetic.

It was not reasoned out. It was caught by seeding a journal to production's real
position and running the block.

## 4. Journal — to be pasted by the owner after the run

```
(stage 1 output)

(stage 2 output)
```
