# PERF-04. THE 90, AND WHAT BATCHING THE AGENDA ACTUALLY COSTS

**BLUE, platform terminal, 2026-09-02. Base `origin/main@4ef185c0` (#1097).**

Nothing here touched production. A disposable `postgres:16` and a disposable
PgBouncer, both on `127.0.0.1`, destroyed afterwards. Standing rule 1, and the
positive-identification guard PERF-08 put on everything in this repository that
opens a connection. **No production read of any kind was performed.** The
production figures in §1 were pasted by the owner and are quoted, not measured.

---

## 0. WHAT IS REAL IN THIS HARNESS AND WHAT IS A STAND-IN

Unchanged from PERF-03 except the last row, which is new and load-bearing for §2.

| | |
|---|---|
| **real** | transaction-mode pooling, `default_pool_size = 15`, `max_client_conn = 400` — the console figures the owner pasted |
| **real** | `withTenantContext`'s shape: `BEGIN`, `set local role`, `set_config`, work, `COMMIT`, with the slot held across all of it |
| **real** | the shipped `/patients` and agenda query set, post-PERF-07, at 8,400 patients / 41,429 appointments / 35,720 completed / dual = 0 |
| **stand-in** | **PgBouncer (C) stands in for Supavisor (Elixir).** Both hold ONE SERVER SLOT PER TRANSACTION, which is the mechanism under test. Supavisor adds its own hop, so **every queue figure here is a LOWER BOUND on production** |
| **stand-in, NEW** | **`RTT_MS` — a fixed delay after every statement inside a transaction.** The shim runs over loopback; production does not. The ceremony is FOUR NETWORK ROUND TRIPS (`BEGIN`, `set local role`, `set_config`, `COMMIT`) and on loopback they cost almost nothing. The delay is paid **while the server slot is held**, which is where a real round trip is paid. `RTT_MS=0` is the loopback truth; 1 and 5 ms bracket a same-region and a slower path. **It is a sensitivity sweep, not a claim about production's RTT, which has not been measured** |
| **absent** | a burstable CPU. The shim's Postgres has more headroom than a t3a.small |

Harness: `pooled4.mjs`, which is `pooled.mjs` from PERF-03 with three agenda
shapes and the `RTT_MS` knob added. `MODE=current` reproduces PERF-03 §2 exactly
— 765 transactions, 3,942 statements, and the same per-kind non-work shares
(agenda small reads 76.2% here against 78.3% there, `viewerLocations` 80.4%
against 81.4%).

---

## 1. TASK 1 — WHAT `max_connections = 90` BOUNDS, AND WHAT IT DOES NOT

**Reporting only. No change proposed, none made. SR-20 stands.**

### 1.1 The one repo fact the arithmetic turns on

**The application opens exactly ONE `(user, db)` pair, and this is checked
rather than assumed.** `packages/db/src/client.ts:32-46` is a lazy singleton
over a single `DATABASE_URL`; `getDbAdmin()` at `:68` returns *the same handle*,
so admin work opens no second pair. `grep -rn "postgres("` over `packages/db/src`
and all three apps' source returns **one** call site — that line. `apps/web`,
`apps/api` and `apps/portal` all depend on `@osteojp/db` and are separate Vercel
deployments, but they connect as the same user to the same database, so at the
pooler they share ONE pool of 15.

This matters because **`pool_size` is per `(user, db)` pair**, so the server-side
total is `pool_size × pairs`. Today `pairs = 1`. A second connection string
added anywhere — a service user, a read-replica user, a second database —
doubles the server-side cost of the *same* `pool_size` setting without anybody
touching it.

**`max_client_conn = 400` costs nothing server-side.** It caps how many *clients*
may attach to Supavisor, not how many Postgres slots are held. 400 against 90 is
not an over-commitment; it is the pooler's whole purpose.

**`DATABASE_URL_DIRECT` is the SESSION pooler on `:5432`**
(`docs/supabase-branching.md:73`), used by `drizzle-kit migrate` because it needs
session-level advisory locks. Same user, same database, different pool mode — and
it holds its connection for the **whole** migration run, not per transaction.

### 1.2 The arithmetic

    pool_size × pairs  +  P  +  S  +  R   ≤   max_connections = 90

    pairs = 1     proven above
    R             superuser_reserved_connections. Postgres' default is 3.
                  NOT READ from production. Assumed 3.
    S             session-mode holds: drizzle-kit migrate (1, for the whole run),
                  an owner psql, the prod-apply worktree. Budget 3.
    P             everything Supabase runs against the same instance — PostgREST,
                  Auth, Realtime, Storage, the dashboard's SQL editor — AT PEAK,
                  not at idle.

With one pair, `R = 3` and `S = 3`:

> **`pool_size` ≤ 84 − P_peak**

### 1.3 P has not been read, and it is what decides the answer

The owner pasted **"direct connections 7 of 90"**. That is 90 confirmed as
`max_connections`, and it is the only part of the line the arithmetic can use,
because **the 7 has two readings and they give different ceilings:**

- **If 7 is every established backend**, then `P + S ≈ 7` at that instant and the
  ceiling is around 77.
- **If 7 counts only direct (non-pooler) client connections**, the pooler's up-to-15
  and Supabase's own services sit on top of it, unmeasured.

Neither reading can be settled from here, so the ceiling is a range:

| P_peak | safe `pool_size` |
|---|---|
| 7 | 77 |
| 20 | 64 |
| 40 | 44 |
| 60 | 24 |
| 70 | 14 — **below the value in force today** |

**That range straddles 30, the only value anyone has proposed.** So
`max_connections = 90` does not settle the pool-size question. It bounds it
loosely, and the binding number is one nobody has read — which is the same shape
as PERF-09, and it is a different missing number, not the same one.

### 1.4 The number at which the platform fails before the clinic screen

Asked directly, and the answer is structural rather than a threshold:

> **The platform fails first at EVERY exhaustion point, not at a particular one.**
> Postgres refuses NEW connections at `max_connections − superuser_reserved_connections`.
> It never evicts an established one. **So whoever already holds a slot keeps it,
> and whoever asks for one loses.**

The app almost never asks. Supavisor's server connections are long-lived: opened
on first use and held across the clinic day. The platform asks constantly —
PostgREST re-pools, Auth issues tokens, Realtime reconnects on websocket churn,
Storage connects per request, and the dashboard's SQL editor opens a fresh
connection for every query.

**So exhaustion presents as: the Supabase dashboard and the API are broken, and
the clinic's agenda is fine.** Reception notices nothing. The first symptom
reaches the owner as "Supabase is down", and it will be read as a vendor outage
rather than as a setting that was raised. The clinic screen degrades LAST and by
a different mechanism — a Supavisor slot that dies is not re-established either,
so the app's capacity erodes silently over hours rather than failing at once.

Numerically, with one pair: **the platform starts losing reconnections when
`pool_size + P_peak + S > 87`.** Every row of the table in §1.3 is that
inequality solved for `pool_size`.

### 1.5 And the connection ceiling is not the constraint that binds

Stated plainly because §1.3's table invites the opposite reading: a ceiling of 44
or 77 sounds like room to move. **There is none, and the reason is already
measured.** PERF-11 ran the same load at `default_pool_size` 15 and 30 and found
that at 32 clients the pooler queue collapsed from 17.8 ms to 2.6 ms while the
**wall clock got worse** (938 → 1081 ms) and p95 got worse (332 → 516 ms). The
queue was not the bottleneck; the database's CPU was. The shim has more CPU
headroom than a t3a.small, so production shows that more sharply.

**So the connection ceiling sits ABOVE the point at which raising `pool_size`
stops helping.** It is not a budget with slack in it. It is the line past which a
change that was already not helping becomes an outage, and an outage whose first
casualty looks like somebody else's fault.

The owner's own live-card figures — CPU 12%, RAM 22%, Disk IO 1% — are an *idle*
reading, and PERF-11's second condition is CPU headroom **at the moment of a
sustained wait**, which is a different measurement from CPU headroom now.

### 1.6 The one read that closes this, for the owner's own shell

Read-only. It opens no connection this terminal controls and writes nothing.
Standing rule 1: authored here, run by Ivan, output pasted back.

```sql
-- Run at a BUSY clinic hour. Idle is not the measurement.
show max_connections;
show superuser_reserved_connections;

select coalesce(usename, '(none)')                       as db_user,
       coalesce(nullif(application_name, ''), '(unset)') as app,
       backend_type,
       count(*)                                          as conns
  from pg_stat_activity
 group by 1, 2, 3
 order by conns desc;

select count(*) as total_backends from pg_stat_activity;
```

`total_backends` against 90 is `P + S + pool_size` measured rather than assumed,
and the grouped rows say which of them is which. **`pool_size` is safe up to
`87 − (total_backends − current pool holdings)`, and no further** — but §1.5 is
why the answer is still "do not raise it".

---

## 2. TASK 2 — BATCHING THE AGENDA'S SMALL READS

`LE-agenda-batches-small-reads`. **Measured in both shapes, as instructed. The
card's own stated risk did not materialise, and the reason it did not is worth
more than the numbers.**

### 2.1 The three shapes

Per agenda render, counted from `apps/web/app/agenda/page.tsx:70,87` and
`apps/web/lib/scheduling/data.ts:349-415`:

| mode | transactions | statements | shape |
|---|---|---|---|
| `current` | **5** | **25** | `viewerLocations`, then four branches CONCURRENTLY on separate connections |
| `hybrid` | **3** | **17** | `viewerLocations` first (the location scope gates the day query), then the three small reads share ONE transaction while the day-appointments query keeps its own, concurrently |
| `batched` | **1** | **9** | everything serialised inside one `BEGIN`/`COMMIT`, one claims setup |

Each transaction costs five statements regardless of how much work it does:
`BEGIN`, `set local role`, `set_config`, the query, `COMMIT`. Five trivial reads
in five transactions is 25 statements for five queries' worth of work. **The
count of statements, not the count of queries, is what the shapes differ in.**

### 2.2 Agenda-only load, 192 renders per row, `POOL_MAX=2` (as shipped)

    RTT=0ms
    mode     inst clients |  wall | agenda p50/p95 | tx  | slot ms | nonwork%
    current  1    2       |  1244 |    193 / 216   | 960 |    2287 |    81.5
    current  4    8       |   566 |     80 / 93    | 960 |    3837 |    81.6
    current  8    16      |   454 |     56 / 83    | 960 |    5530 |    82.5
    current  16   32      |   472 |     52 / 91    | 960 |    9564 |    89.4
    hybrid   1    2       |   788 |    118 / 132   | 576 |    1453 |    73.2
    hybrid   4    8       |   381 |     50 / 60    | 576 |    2510 |    73.5
    hybrid   8    16      |   333 |     41 / 52    | 576 |    3975 |    73.9
    hybrid   16   32      |   380 |     36 / 60    | 576 |    6504 |    83.6
    batched  1    2       |   420 |     58 / 69    | 192 |     723 |    49.2
    batched  4    8       |   212 |     24 / 32    | 192 |    1131 |    48.6
    batched  8    16      |   214 |     20 / 33    | 192 |    1885 |    49.0
    batched  16   32      |   317 |     24 / 46    | 192 |    4377 |    68.3

    RTT=5ms   (the round trips the shim does not otherwise have)
    current  1    2       | 17675 |  2915 / 3346   | 960 |   35093 |    80.0
    current  8    16      |  2108 |   330 / 359    | 960 |   31843 |    80.3
    hybrid   1    2       | 11987 |  1975 / 2027   | 576 |   23751 |    70.5
    hybrid   8    16      |  1483 |   223 / 252    | 576 |   21527 |    71.1
    batched  1    2       |  6586 |  1081 / 1106   | 192 |   12983 |    44.2
    batched  8    16      |   864 |   120 / 145    | 192 |   11756 |    45.7

Zero errors and zero pooler timeouts in every row, at every RTT.

**Batching wins at every concurrency and every RTT, on p50 AND on p95.** At the
shipped configuration (one instance, `max: 2`) the agenda's p50 falls
**193 → 58 ms** at RTT 0 and **2915 → 1081 ms** at RTT 5. The server slot held
falls 68% and 63% respectively.

### 2.3 The card's stated risk, tested directly, and it does not hold

The card says: *"the four branches currently run CONCURRENTLY against separate
connections, and sharing one transaction serialises them... on a local database
that trades 4 × 1.3 ms of ceremony for serialised execution and is roughly
neutral."*

**It is not neutral, and it is not close.** The reason the card expected neutrality
is that it counted the ceremony being saved against the concurrency being lost,
and the concurrency it counted **does not exist at `max: 2`.** Four concurrent
branches on a two-connection local pool run two at a time. The fan-out is already
serialised; what it buys is four extra sets of ceremony.

So the objection was tested where it *could* be true — with `POOL_MAX=8`, where
the fan-out has genuine room:

    RTT=0ms  POOL_MAX=8
    mode     inst clients |  wall | agenda p50/p95 | tx  | slot ms | nonwork%
    current  1    8       |   550 |     76 / 115   | 960 |    3739 |    82.3
    current  8    64      |   428 |     54 / 84    | 960 |   15964 |    93.2
    hybrid   1    8       |   375 |     50 / 57    | 576 |    2471 |    73.6
    hybrid   8    64      |   304 |     33 / 60    | 576 |    9097 |    89.4
    batched  1    8       |   213 |     25 / 34    | 192 |    1234 |    50.0
    batched  8    64      |   203 |     19 / 32    | 192 |    3332 |    72.6

    RTT=5ms  POOL_MAX=8
    current  1    8       |  4884 |   787 / 878    | 960 |   38254 |    80.5
    current  8    64      |  1795 |   271 / 350    | 960 |   78912 |    92.2
    hybrid   1    8       |  3201 |   517 / 554    | 576 |   24707 |    71.1
    batched  1    8       |  1827 |   287 / 315    | 192 |   13956 |    46.2
    batched  8    64      |   841 |   110 / 160    | 192 |   21457 |    69.7

**Batching still wins by 2.5×, with four connections free to fan out onto.** Five
sub-millisecond queries run back-to-back finish sooner than four of them started
in parallel behind four separate `BEGIN`/`set local role`/`set_config`/`COMMIT`
sequences. **Serialising work that takes 1.3 ms is cheaper than parallelising
ceremony that takes four round trips**, and the gap widens with RTT because
ceremony is round trips and the work is not.

### 2.4 The whole page, PERF-03 §2's exact configuration, three runs each

One instance, `max: 2`, 30 sessions, `MIX=mixed` — only the agenda shape swapped.
Stable to under 1% across runs, so the three-run spread is quoted, not averaged.

    RTT=0ms
    mode     run |  wall | patients p50 | agenda p50 | create p50 |  tx | stmts | slot ms | nonwork%
    current  1-3 | 4009-4085 |  633-639 |   744-790  |  593-603   | 765 |  3942 | 7997-8140 | 16.6-17.0
    hybrid   1-3 | 3871-3918 |  627-633 |   607-616  |  626-657   | 603 |  3294 | 7716-7811 | 13.3-13.5
    batched  1-3 | 3766-4368 |  621-712 |   265-318  |  604-699   | 441 |  2646 | 7511-8708 |  9.7-11.2

    RTT=5ms
    current  1-3 | 16509-16706 | 2357-2373 | 3138-3171 | 2265-2288 | 765 | 3942 | 32933-33332 | 60.8-60.9
    hybrid   1-3 | 14291-14395 | 2339-2371 | 2335-2344 | 2370-2388 | 603 | 3294 | 28531-28737 | 54.4-54.5
    batched  1-3 | 11933-11979 | 1802-1839 | 1128-1143 | 2253-2264 | 441 | 2646 | 23815-23904 | 47.4-47.5

**Read the two RTT blocks against each other, because they say different things
and only one of them is about production.**

- **At RTT 0 the whole-page wall clock barely moves** (4,009-4,085 → 3,766-4,368).
  The agenda's own p50 falls 60% (745 → 291 median of runs) but the mixed wall is
  dominated by the two big `/patients` queries, which are 96-98% work and which
  batching does not touch. `patients` p50 is flat to slightly worse, inside run
  noise.
- **At RTT 5 the whole load improves 28%** (16,509-16,706 → 11,933-11,979), the
  agenda 64% (3,138-3,171 → 1,128-1,143), and **`/patients` improves too**
  (2,357-2,373 → 1,802-1,839) *without its queries changing at all* — the freed
  slots go to them.

**The second block is the one that resembles production**, because production has
the four round trips and the shim does not. The PERF-03 finding that made this
card — the ceremony is four network trips and the trivial reads' work is a
fraction of one — is exactly what RTT models, and it is where the whole-page win
appears.

### 2.5 What is being recommended, and it is not `batched`

**`hybrid`, not `batched`, and the numbers are not why.**

`batched` folds the day-appointments query — the one real query on the page —
into the same transaction as four trivial lookups. It measures better here
because in the shim that query is fast. It makes the page's slowest read wait
behind four lookups that have nothing to do with it, and it does so on the read
whose cost grows with the clinic's diary while the other four stay constant.
`hybrid` keeps that query on its own slot, concurrently, and still removes
**8 of the 25 statements** and 40% of the transactions.

`hybrid` at RTT 5, whole page: **wall −14%, agenda p50 −26%, transactions
765 → 603, statements 3,942 → 3,294.** Agenda-only at the shipped configuration:
**p50 1,975 against 2,915 ms.**

Not merged. **No ruling is asked for in this document beyond the owner's; the
card stays `todo` and the branch carries no implementation.**

---

## 3. TASK 3 — THE CONFIGURATION SEEDS NOW NAME THEIR TARGET

`SEC-config-seeds-have-no-target-guard`, built. Full reasoning is in
`packages/db/seed/target-confirmation.ts`; the short form:

- **It asks on every target, and never classifies one.** There is no "is this
  production?" branch, because that branch is a blocklist and SR-08 rules against
  a verdict built from absence. An unrecognised host — including a production
  project provisioned tomorrow — is exactly the case a blocklist calls safe.
- **The confirmation names the parsed host.** `SEED CONFIG INTO <host>`. A line
  typed for a local run does not authorise a production one.
- **Read from stdin, never from the environment.** An env var is one more thing a
  shell can hold from an hour ago, which is the failure being closed. A
  non-interactive stdin is a refusal; nothing in `.github/workflows` invokes
  either CLI, checked rather than assumed.
- **Exit 2**, `BAD_INVOCATION` per CLAUDE.md's ratified table. Nothing attempted,
  nothing failed.
- The gate runs **before the driver is imported**, so a refusal opens no
  connection. `tests/seed-target-confirmation.test.ts` asserts that ordering on
  the source of both CLIs.

**Both arms are tested and the negative arm is proven new.** Every refusal case
also asserts that the predicate it replaces — `if (!databaseUrl) throw` — would
have proceeded to the write. Run against `origin/main`'s two CLI files, the
suite is RED (2 failed / 18 passed); with them, 20/20.

### A defect this card's test found in a SHIPPED guard

`local-target.ts` documents its parsing as: *"`new URL()` ... THROWS on a
password holding an unescaped `@` or `/`, which real passwords do."* **The `/`
half is false.** `new URL()` does not throw; it treats the first `/` as the start
of the path and returns a host that is not the target. Measured on Node 22:

    postgresql://postgres.abc:p@ss/w0rd@aws-0-eu-west-2.pooler.supabase.com:6543/postgres
      -> new URL().hostname === "ss"

The documented fallback parser never runs, because it is reached only when
`new URL()` throws. **For `assertLocalTarget` this fails CLOSED** — `"ss"` is not
an allowed local host, so the seven dev seeds refuse — which is why it has never
been seen. **For a gate that PRINTS the host and asks the operator to type it
back, it would not**: the operator would affirm `ss` and the write would land on
the pooler.

`parseTargetHost` is **not** patched from here — it is a shipped guard with other
callers and the misparse is fail-closed for all of them. It is carded as
`SEC-parse-target-host-slash-in-password`. What this card's module does instead
is read the host a **second** way (last `@` first, then the first `/`) and refuse
when the two readings disagree, in either direction. A target that cannot be read
the same way twice is one the operator cannot be asked to confirm.

---

## 4. TASK 4 — CARDED, NOT BUILT

`LE-24h-sms-tokenized-confirm-link`. Design and open questions on the card. **No
code, no template edit, no token change, no migration.** The exact character
budget, re-derived from the committed signer and templates rather than
transcribed, is on the card and in §5 below.

---

## 5. THE SEGMENT BUDGET, RE-DERIVED

Measured from `apps/web/lib/reminders/templates.ts`, `reminder-copy.ts` and
`fee-notice.ts` at `origin/main@4ef185c0`, filled with the worst case
`twilio-proof.test.ts:97-104` pins (`Castelo Branco`, `+351 210 000 000`).

    SMS_SEGMENT_LIMIT                                        160
    24h pt body, worst case                                   99   margin 61
    + fee notice  (53 + LF)                                  153   margin  7
    + reply line  (48 + LF)                                  148   margin 12   <- permanently OFF, see the card
    token as shipped (payload 158 + "." + signature 43)      202
    https://osteojp.pt/r/<token>                             223

**So the appended block has 61 characters including its leading LF, and the link
LINE has 60.** The shipped stateless token is 202 — three and a half times the
whole budget, and this reproduces PW-B's measurement exactly (202 = 158 + 1 + 43).

    prefix                              len   token budget
    osteojp.pt/c/                        13             47
    https://osteojp.pt/c/                21             39
    Confirmar: osteojp.pt/c/             24             36
    Confirmar: https://osteojp.pt/c/     32             28

A 22-character base64url token (132 bits) fits every one of them. **It cannot be
stateless** — that is PW-B's finding and it stands — so it requires a store, and
a store is a new table.

---

## Reproduction

`docker network`, `postgres:16`, `edoburu/pgbouncer` in `pool_mode = transaction`
with `default_pool_size = 15` and `max_client_conn = 400`. Schema and index set
transcribed from `packages/db/migrations` including 0068; seeded to 8,400
patients / 41,429 appointments / 35,720 completed / dual = 0; `ANALYZE` before
measurement; row counts verified after seeding rather than assumed. `authenticated`
created as a `NOLOGIN` role with `SELECT/INSERT/UPDATE/DELETE` on `public`, which
is what `set local role authenticated` needs. Every container disposable and
destroyed; no credential, no production host, no local Supabase stack.
