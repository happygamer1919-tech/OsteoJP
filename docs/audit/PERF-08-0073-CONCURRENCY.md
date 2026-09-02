# PERF-08 Task 2 — /patients at 30 and 60 concurrent, with 0073 on production

**Question the owner asked:** re-run the full 30 and 60 concurrent harness, RLS
on, as reception, against the PERF-06 numbers, *"so the compute-size decision is
taken on a platform that is not fighting itself"*.

**Answer, in one line: do not upsize compute.** 0073 cut the CPU cost of a
`/patients` render by **2.3x**, which is more headroom on this path than a
compute doubling would have bought — and the clinic's measured mean concurrency
is **0.27**, which is not in the region where either lever matters.

---

## 1. The instrument, and the check that it is the same instrument

Same disposable shim PERF-06 used: `postgres:16` in Docker, `pgbouncer` in
**transaction mode** at `default_pool_size 15` / `max_client_conn 400`, seeded to
the shape the PERF-01 card records from production — **8,400 patients, 41,429
appointments, 16 `staff_locations`**. The driver is PERF-05's
`patients-load.mjs` unchanged: one process is one warm Fluid instance, every
concurrent render shares the one `postgres` client, and every statement runs
inside `set local role authenticated` with reception's claims, so **RLS applies**.

**The policies were not transcribed. The repository's own migration files were
applied to the shim verbatim** — `0071_wrap_nullary_viewer_helper.sql` for the
BEFORE and `0073_viewer_visible_patient_set.sql` for the AFTER. So BEFORE is
production as it was on the morning of 2026-09-02 and AFTER is production as it
is now. This matters because SR-24 exists: every harness before PERF-05 built its
shim from the TABLES and omitted the POLICIES, and was wrong by up to 29x without
anything reporting an absence.

**Validity check, run before anything new was measured.** A comparison across
sessions is only a comparison if it is the same instrument:

| 60 concurrent, RLS on, `sort=name`, p50 | PERF-06 recorded | this run |
|---|---|---|
| `max: 2`, 0071 | 29.8 s | **31.6 s** |
| `max: 6`, 0071 | 15.2 s | **15.6 s** |

Within 3–6%. The instrument reproduces.

## 2. The grid

p50 render latency, RLS on, as reception, `sort=name`, `STATS=critical` (the
render waits for the stat strip, as shipped). Zero errors at every point.

| | BEFORE (0071) | AFTER (0073) | change |
|---|---|---|---|
| 30 concurrent, `max: 6` | 6,828 ms | **2,974 ms** | **−56%** |
| 60 concurrent, `max: 6` | 15,598 ms | **6,403 ms** | **−59%** |
| 30 concurrent, `max: 2` | 15,211 ms | **6,949 ms** | **−54%** |
| 60 concurrent, `max: 2` | 31,642 ms | **14,313 ms** | **−55%** |

Consistent across pool size and concurrency, which is what a change to the cost
of the WORK looks like. A change to queueing would not be flat like this.

**The curve, after 0073, at `max: 6`:**

| concurrent | 1 | 10 | 20 | 30 | 60 |
|---|---|---|---|---|---|
| p50 | **378 ms** | 1,066 ms | 2,552 ms | 2,974 ms | 6,403 ms |

Sub-linear to about 10, linear above it. PERF-06's equivalent single render was
1,459 ms.

## 3. The measurement that decides the compute question

Latency at a chosen concurrency is a property of the harness's hardware and does
not transfer to production. **CPU per unit of work does, approximately** — so
that is what was measured, by sampling the database container during the 60
concurrent run.

| 60 concurrent, `max: 6` | database CPU | wall | renders | **core-seconds per render** |
|---|---|---|---|---|
| BEFORE (0071) | ~597% (5.97 cores) | 35.3 s | 120 | **1.75** |
| AFTER (0073) | ~589% (5.89 cores) | 15.7 s | 120 | **0.77** |

**The database is CPU-saturated in BOTH cases**, at essentially the same number
of cores. Nothing about the saturation changed. What changed is that **each
render now costs 2.3x less CPU to produce**, because the policy stopped
evaluating two correlated `SECURITY DEFINER` helpers on 8,400 rows before the
name filter could remove any of them.

That is the whole compute-size argument in one number: **0073 delivered a 2.3x
capacity increase on this path by removing work.** Buying it with compute would
have cost money every month and would have left the work in place.

## 4. So: do not upsize compute

Four reasons, in the order that matters:

1. **The saturation had a cause and the cause is gone.** The platform was
   fighting itself: 91% of the per-row cost was RLS work that the search filter's
   selectivity could not reduce, which is why the cost was flat in the query
   length. That is fixed, on production, since 2026-09-02.
2. **Per-render CPU halved.** A compute doubling buys 2x. This bought 2.3x, on
   the path that was slow, without changing the bill.
3. **The clinic is nowhere near the linear region.** PERF-09 derived **mean
   concurrency 0.27** and Active CPU at **0.25% utilisation**, from the owner's
   own pasted figures. The curve is sub-linear below ~10 concurrent — roughly 37x
   the observed mean. A larger instance would buy capacity in a region the clinic
   has never been observed to enter.
4. **A single render is now 378 ms on this hardware.** At the concurrency the
   clinic actually runs at, that is the number reception experiences, not the
   6.4 s at 60.

**What to do instead, and it is already carded:** take the production reading on
the deployed `/patients` as reception. If it is still slow *there* at the
concurrency the clinic actually has, the bottleneck is not this path — and a
compute upgrade would be capacity bought for the wrong thing.

**The trigger that would reopen this.** Either of: production p75 on `/patients`
staying above ~1.5 s at observed concurrency after this deploy; or mean
concurrency rising past ~10, where the curve turns linear. Both are readings the
owner can take; neither is a judgement call.

## 5. What this harness cannot say, stated so nobody quotes it as more

- **It has no network.** Every statement here is a loopback round trip. On
  production each one crosses the transaction pooler, and PERF-07 already
  recorded that the harness therefore cannot size the value of removing a
  statement.
- **The host is not the production instance.** 10 cores, no throttling, no
  burst credits. Absolute milliseconds are a lower bound on production; the
  RATIOS and the core-seconds are the transferable part.
- **One process, not Fluid.** The model is PERF-05's: one warm instance sharing
  one pool. It does not model several instances, cold starts, or the pooler's
  own client limit.
- **The pool sizes measured are 2 and 6.** 6 is what production runs since
  #1100. Nothing here proposes changing it, and SR-20's refusal of `pool_size`
  as a lever is untouched.
