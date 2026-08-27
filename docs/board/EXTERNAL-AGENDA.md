# External agenda — work that left this board, and where it went

**Ruled by the owner, 2026-08-20.** Legal review and counsel, credential
rotation, force-rotation of staff passwords, and security-breach response are
tracked on Ivan's own agenda. Carrying them on the engineering board as well
created **duplicate tracking**: a card on this board reads as work engineering
owes, and none of these are.

## The cards are NOT deleted, and that is the point

**The ledger stays.** A deleted card takes its history with it — what was found,
when, who ruled on it, and what the ruling was. That record is the only durable
account of decisions nobody wants to re-litigate, and it is worth more than a
shorter file.

What the `external_agenda: true` field removes is the card's appearance on the
rendered artifact and in every count on it. **The row below is the whole of its
presence here.** To read the full history of any of them, open
`docs/board/portal-board.json` and find the id.

## How it is enforced, so this file cannot rot

- `docs/board/validate-board.mjs` accepts `external_agenda` as **exactly `true`
  or absent** — never `false`, because a field meaning "not external" on 180
  cards makes the absence of the field stop meaning anything.
- `docs/board/render-board.mjs` filters flagged cards out of the artifact, the
  lane counts, the data island **and the fingerprint**, and prints how many it
  dropped rather than dropping them silently.
- The same filter runs over `rulings[]`, and the renderer prints that count on
  its own line too.
- `scripts/external-agenda-ledger.test.mjs` runs in the required check and
  asserts this file and the board agree **in both directions**, over `cards[]`
  **and** `rulings[]`: every flagged entry has a row here, and every row here
  names a flagged entry.

## Two of these rows are RULINGS, not cards

**`WF-13` and `WF-15` moved out of `cards[]` into `rulings[]` on 2026-08-27**, by
the owner's ruling that recorded decisions are not build work and must stop
rendering as to-do tasks. A ruling has **no status**, which is why their Status
column reads *ruling* rather than *todo* — nothing finishes a decision, so the
word "todo" on one was never true.

Nothing else about them changed. `external_agenda: true` means the same thing in
either section, `render-board.mjs` filters rulings by it exactly as it filters
cards, and `scripts/external-agenda-ledger.test.mjs` reads **both** sections, so
the two-way guard below still covers them.

## What is deliberately NOT here

**`LAUNCH-01` (launch-day canaries), `LAUNCH-02` (JP's packet sign-off) and
`LAUNCH-03` (the Fisiozero data migration) stay on the board.** They are launch
execution, not legal work, and they gate a deployment rather than a filing.

**`LAUNCH-03a-caderno-encargos` also stays**, and it is the one judgement call in
this list worth naming. `PORTAL-REHYDRATE.md` §4.11 calls it a child of the legal
family, which would put it here. Its own notes say otherwise: it is the
procurement spec for **the Fisiozero export**, the same launch execution
`LAUNCH-03` is, one document earlier. It is on the board.

**It is no longer waiting on Ivan, corrected 2026-08-20.** This paragraph used to
say it waited on him forwarding the document to the vendor. **Caderno v1.1 went to
Eduardo at Fisiozero on 2026-08-18**, and the card now waits on the vendor's
*amostra*, the 20-to-50-patient sample section 8 of the document asks for. The
conclusion is unchanged and the reason it rests on is not: it stays on the board
because it is procurement for `LAUNCH-03`, which was always the load-bearing half.

**`SEC-02-temp-password-no-forced-rotation` stays.** It is shipped product code
that forces a rotation at first login. The *operational* rotation of accounts
onboarded before it is `LE-force-rotation-existing-staff`, which is here. The
code is engineering; the errand is not.

---

## The ledger

| Card | Status | Category | Where it stands |
|---|---|---|---|
| `END-legal-sweep` | **halted** | legal · RGPD · credential sweep | The family head: end-of-project engagement with external counsel and a cybersecurity representative. AUTORIZO-gated — it cannot start without the owner. It also **absorbs findings**: engineering appends questions to it so counsel receives them with the rest of the material rather than as separate interruptions. |
| `WF-15` | **ruling** | legal · regulatory | The owner's ruling of 2026-08-05, verbatim: *"An external lawyer and a cybersecurity representative now own all legal and regulatory connections, policies and filings. Engineering scope is code and platform function only."* This card **is** the instruction that produced this file. |
| `WF-13` | **ruling** | credential rotation | The owner's ruling R10, 2026-08-05: owner credential rotation **confirmed**. It closes an exposure card recording that live credentials sat in two committed docs since June — a dev database password, an IfThenPay backoffice key, a QA portal password. They were in git history, so **rotation was the only fix**, and it is done. |
| `LE-force-rotation-existing-staff` | **todo** | force-rotation of staff passwords | Every staff account onboarded **before** `SEC-02` received a password an admin chose and could read. The card records why this is not a migration: GoTrue owns the credential and exposes no password-last-changed fact, so **there is no predicate** that selects only the accounts still holding a handed-over password — the arms are *nobody* or *everybody*. Owner-timed. |
| `LE-guest-queue-service-name` | **blocked** (ivan) | legal review | *May reception's guest queue show the service a guest requested?* The guard forbidding it is annotated **counsel-derived**, and reading intent into a counsel-derived guard is the decision the standing rules reserve. Already appended to `END-legal-sweep` so counsel gets it with the engagement material. It stays open because it **gates a build decision**, unlike the findings that card merely absorbs. |
