# PERF-03. THE POOLER IN THE HARNESS, AND WHAT IT CHANGES

**BLUE, platform terminal, 2026-09-02. Base `origin/main@29cf0d4f`.**

Nothing here touched production. A disposable `postgres:16` and a disposable
PgBouncer, both on `127.0.0.1`, destroyed afterwards. Standing rule 1, and the
positive-identification guard PERF-08 put on everything in this repository that
opens a connection.

---

## 0. WHAT IS REAL IN THIS HARNESS AND WHAT IS A STAND-IN

The conclusion depends on this, so it is first rather than in a footnote.

| | |
|---|---|
| **real** | transaction-mode pooling, `default_pool_size = 15`, `max_client_conn = 400` — the console figures the owner pasted |
| **real** | `withTenantContext`'s shape: `BEGIN`, `set local role`, `set_config`, work, `COMMIT`, with the slot held across all of it |
| **real** | the shipped `/patients` and agenda query set, post-PERF-07, at 8,400 patients / 41,429 appointments |
| **stand-in** | **PgBouncer (C) stands in for Supavisor (Elixir).** Both hold ONE SERVER SLOT PER TRANSACTION, which is the mechanism under test. Supavisor adds its own hop, so **every queue figure here is a LOWER BOUND on production** |
| **absent** | network latency. One machine, so the round-trip component of the four setup statements is understated too |
| **absent** | a burstable CPU. The shim's Postgres has more headroom than a t3a.small, which makes §3's conclusion **stronger**, not weaker |

---

## 1. TASK 1 — THE MATRIX

30 staff sessions, mixed agenda reads + `/patients` + appointment creates, through
the 15-slot pooler. `BEGIN` is the first statement of a transaction, so it is
where a transaction-mode pooler assigns a server slot: its latency **is** the
pooler queue.

    inst max clients |  wall | /patients p50/p95 | agenda p50/p95 | create p50 | BEGIN p50/p95
    1    2   2       |  2658 |      628 / 723    |    734 / 1113  |       578  |   0.18 / 0.30
    1    4   4       |  1384 |      317 / 364    |    372 /  554  |       260  |   0.22 / 0.30
    1    8   8       |  1155 |      259 / 308    |    289 /  376  |       190  |   0.34 / 0.80
    1    16  16      |  1129 |      255 / 347    |    206 /  286  |       122  |   1.39 / 8.20
    2    8   16      |  1083 |      242 / 338    |    219 /  254  |       156  |   1.34 / 7.20
    4    4   16      |   861 |      200 / 331    |    153 /  201  |        83  |   1.15 / 5.47
    4    8   32      |   866 |      211 / 290    |    149 /  224  |        99  |  18.17 / 46.67
    8    2   16      |   748 |      172 / 199    |    151 /  197  |        90  |   1.00 / 4.45
    8    8   64      |   732 |      172 / 209    |     80 /  127  |        89  |  22.48 / 44.44

Zero errors and zero pooler timeouts in every row.

**THE QUEUE TRACKS TOTAL CLIENTS, NOT THEIR DISTRIBUTION.** Sixteen clients cost
about the same `BEGIN` whether they arrive as 1×16, 2×8, 4×4 or 8×2 (1.39 / 1.34 /
1.15 / 1.00 ms). Past the 15 slots it climbs sharply: 32 clients is 18 ms, 64 is
22 ms.

**AND OVERSUBSCRIBING IS NOT HARMFUL HERE.** 8×8 = 64 clients has the *best* wall
clock in the table despite paying 22 ms of queue on every transaction, because a
queue keeps all fifteen slots saturated. The queue is a cost; idle slots are a
bigger one.

### The direct control, no pooler at all

    max=2   wall 2515   /patients p50 578 p95 686
    max=8   wall 1212   /patients p50 265 p95 328
    max=16  wall 1118   /patients p50 275 p95 391

**The pooler costs almost nothing at these volumes** — 2658 against 2515 at max=2,
1155 against 1212 at max=8. What it does is impose a ceiling. It is not a tax on
each request; it is a cap on how many can run at once.

### What I recommend, and what it is bounded by

**Do not change `max`. And the reason is not the one in the dispatch.**

The dispatch's reason — the load test cannot prove the value against the pooler
limit — was correct when it was written and this harness now removes it. The
harness *has* the pooler. The reason to leave `max` alone is a different one, and
it is stronger:

> **`max` only matters while `N × max < 15`, where N is the number of warm
> serverless instances. I cannot read N, and it decides the whole question.**

- If production runs **1–2 warm instances**, `max: 2` gives 2–4 clients against 15
  slots. **Eleven to thirteen slots sit idle**, and the first row of the table is
  what that costs: `/patients` p50 628 ms against 259 ms at max=8. Raising `max`
  would be a large, real win.
- If production runs **eight or more warm instances**, `max: 2` already puts 16
  clients on 15 slots. The ceiling is already reached, raising `max` buys nothing
  measurable, and the 8×2 row is already among the best in the table.

Both are consistent with everything measured here. **The number that separates
them is the warm instance count**, and it is one dashboard read: Vercel →
`osteojp-platform` → Observability → Functions → concurrent executions, at a busy
clinic hour. Note that Fluid Compute changes this materially — one instance serves
many concurrent invocations, so N is smaller than request concurrency and `max: 2`
is more likely to be the binding constraint than it looks.

**If the answer is that app pool max barely matters once the pooler is the
ceiling: that is true only above the ceiling, and it is not where production
necessarily sits.** Below it, `max` is the whole game — a 2.4× wall-clock
difference in this table.

---

## 2. TASK 2 — WHAT THE TRANSACTION HOLD COSTS

Three runs, one instance, `max: 2`, 765 transactions each. Stable to a tenth of a
percent:

    SERVER SLOT HELD            7188 / 7215 / 7279 ms over 765 transactions
      BEGIN  (pooler assign)     1.9%
      setup  (role + set_config) 5.9%
      WORK   (the queries)      89.9%
      COMMIT                     2.2%
    NON-WORK SHARE              10.1% / 10.0% / 9.9%

**THAT AVERAGE IS MISLEADING AND THE BREAKDOWN IS THE ANSWER.**

    transaction kind                      n     slot ms/tx    work%    NON-WORK%
    viewerLocations (trivial lookup)    180        1.36       18.6%      81.4%
    agenda's small reads                405        1.33       21.7%      78.3%
    createAppointment (lock + insert)    18        3.80       61.9%      38.1%
    getPatientListStats (one pass)       81       36.49       96.8%       3.2%
    listPatientsPage (count + page)      81       52.71       97.9%       2.1%

**585 of 765 transactions — 76% — are trivial reads that spend about 80% of their
server slot on transaction ceremony.** The 10% aggregate is an average weighted by
the two big queries, which are almost pure work.

On production this gets worse, not better: the non-work is **four network round
trips** (`BEGIN`, `set local role`, `set_config`, `COMMIT`) and the trivial reads'
work is a fraction of one. The big queries stay overwhelmingly work.

### The ruling question, answered by demonstration

**Scoped reads MUST NOT stop wrapping in a transaction, and this is not a judgement
call.** `set_config('request.jwt.claims', …, true)` — the third argument is
`is_local` — and `set local role` are transaction-scoped *by construction*. The
transaction is not overhead around the claims; **it is what ends them.**

Run on the shim, through the pooler:

    A) AS SHIPPED — set_config(..., true) inside a transaction
       inside tenant A's transaction : {"tenant_id":"aaaaaaaa-...
       after COMMIT, slot reusable   : NULL   <- the claims ended with the transaction

    B) THE PROPOSED CHANGE — no transaction, so the flag must become false
       after tenant B's read         : {"tenant_id":"bbbbbbbb-...
       ... and on the NEXT statement : {"tenant_id":"bbbbbbbb-...

       VERDICT: LEAKED. Tenant B's claims are still on the connection with no
                transaction to end them. In transaction-mode pooling that
                connection now goes to the next client.

**So the 80% is real and the fix is not to unwrap.** It is to have fewer trivial
transactions. PERF-07 already removed 270 of 780 by memoising
`resolveViewerLocationIds`; the 405 remaining "small reads" are the agenda's, and
they are separate `runScoped` calls that could share one transaction. That is a
carded refactor, not a doctrine change, and it is `LE-agenda-batches-small-reads`.

---

## 3. TASK 3 — WHAT WOULD JUSTIFY RAISING THE POOL SIZE

Measured rather than reasoned: the same load at `default_pool_size` 15 and 30.

    pool_size=15  clients=32 | wall  938 | /patients p50 204 p95 332 | BEGIN p50 17.83 p95 63.0
    pool_size=30  clients=32 | wall 1081 | /patients p50 223 p95 516 | BEGIN p50  2.64 p95 49.6

    pool_size=15  clients=64 | wall  817 | /patients p50 197 p95 226 | BEGIN p50 21.13 p95 66.7
    pool_size=30  clients=64 | wall  762 | /patients p50 162 p95 237 | BEGIN p50  4.78 p95 23.4

**Doubling the pool size removes the queue and does not reliably buy latency.** At
32 clients the queue collapses from 17.8 ms to 2.6 ms and the wall clock gets
**worse** (938 → 1081) with p95 worse too (332 → 516). At 64 clients it is a
modest 7% win on wall.

The reason is the one that matters for a burstable instance: **the pooler queue
was not the bottleneck; the database's CPU was.** Raising the pool size does not
create capacity, it relocates the wait — out of a visible queue at the pooler and
into invisible contention on a finite CPU. The shim has more CPU headroom than a
t3a.small, so production would show this **more** sharply, not less.

### The evidence that would justify asking, stated as a test

Both of these, together. Either alone is not enough:

1. **Sustained non-zero client wait at Supavisor** under real clinic load — not a
   spike, a sustained one. The figure to read is the pooler's own wait
   accounting, and the threshold is: the wait is a material fraction of the
   request, not the ~1 ms this table shows at 16 clients.
2. **Demonstrated CPU headroom on the database** at that same moment. Today there
   is none to point at: the compute was at 97% on Micro and has just been resized
   to Small, and nothing has yet been measured on Small under clinic load. Raising
   the pool size against a saturated CPU is the 32-client row above.

**The cheaper lever comes first.** Every trivial transaction removed is a slot
returned to the pool without touching any limit — §2's 405 agenda reads are worth
more than the pool-size question, and carry none of its risk.

### The risk at the `max_connections` ceiling

`pool_size` is **per user+db pair**, so the server-side total is
`pool_size × distinct(user, db)`, and those compete with everything Supabase runs
on the same instance — PostgREST, Auth, Realtime, Storage, the migration user, and
`superuser_reserved_connections`. Exhausting `max_connections` does not degrade
gracefully: new connections are refused outright, and the first casualties are
usually the platform services rather than the app, which presents as the dashboard
and the API breaking while the clinic screen looks fine.

**No number is recommended here.** The owner is reading direct `max_connections`
from the dashboard. The arithmetic to apply when it arrives is:

    headroom = max_connections
             - superuser_reserved_connections
             - (what Supabase's own services hold)
             - (pool_size x number of user+db pairs already in use)

and the proposed new `pool_size` must fit inside `headroom` with room for the
migration path, which opens a **session-mode** connection on port 5432 and holds
it for the whole of `drizzle-kit migrate`.

---

## Reproduction

`docker network`, `postgres:16`, `edoburu/pgbouncer` in `pool_mode = transaction`
with `default_pool_size = 15` and `max_client_conn = 400`. Schema and index set
transcribed from `packages/db/migrations` including 0068; seeded to 8,400 patients
/ 41,429 appointments / 36,309 completed / dual = 0 / 2,246 future active;
`ANALYZE` before measurement. The harness unrolls `withTenantContext` so each
phase is timed separately, and drives the query set transcribed from
`apps/web/lib/patients/list-queries.ts` as merged in #1093. Every container is
disposable and destroyed; no credential, no production host, no local Supabase
stack.
