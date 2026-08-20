# ACC-visibility-assertions-unswept — the enumeration

**Derived from `origin/main` at `ce0987c`, 2026-08-19.** Method stated first so
the number can be re-derived or disputed without asking anyone.

---

## The population, and why it is the right one

`ACC-identity-blind-assertions` swept 170 `toHaveCount(N)` assertions. Its own
closing finding was that **the population was wrong**: an exact count
*self-corrects*, because a foreign row usually pushes it off the expected number
and the test goes red. The population that passes falsely **as its ordinary
behaviour** is visibility and text assertions on a non-identity locator — they
pass on *any* matching row and fail only when nothing matches, so contamination
makes them **more** likely to pass.

That population is `toBeVisible`, `toBeHidden`, `toContainText`, `toHaveText`
across `apps/web/e2e`. **494 assertions, 60 spec files** — roughly three times
the count sweep.

## Every assertion is accounted for

The classifier is comment-stripped, multi-line aware, and resolves one level of
variable indirection. **Its buckets sum to 494, and that equality is asserted** —
without it the residue could hide in a parsing gap and the headline number would
be an artefact of the regex rather than a fact about the suite.

| bucket | n | why it cannot be satisfied by a foreign row |
|---|---|---|
| absence assertions (`toBeHidden`, `.not.`) | 46 | **safe direction.** Contamination makes these FAIL, which is loud, not silent |
| identity-bearing locator | 48 | `uniq()`, `randomUUID`, `RUN_DAY_BASE`, a `hasText` filter on a run-created variable |
| chrome / testid / label | 203 | addresses a button, dialog, heading, tab, testid. **No database row can conjure a button** |
| scoped to a container the test opened | 32 | a modal, drawer or row the test itself narrowed to |
| text literal on a **detail** page | 91 | the page shows ONE subject — reached by id or `/new`, where a foreign row cannot appear |
| no `goto` resolved before the assertion | 17 | unresolved by the classifier; not claimed either way |
| **unscoped text literal on a LIST page** | **57** | the only shape where a foreign row sits beside yours |

## The 57 read individually — one real case

Reading them, they fall into four groups, and only the last is a candidate:

- **Toasts** (~11): `"Horário guardado"`, `"Nome atualizado."`, `"Palavra-passe alterada."`, `"Notas guardadas"`, `"Palavra-passe incorreta"`. A toast is raised by the action the test just performed. **A row cannot raise a toast.**
- **Static page chrome** (~14): the dashboard and estatísticas stat *labels* (`"Pacientes ativos"`, `"Receita total"`), the `/^sáb/` weekday column header. Copy, not data.
- **Scoped to a narrowed element** (~24): `packRow`, `archivedRow`, `target`, `dash`, `band`, `dialogAfter`, `pontualRow`, `triggers.nth(...)`, `card(page, MULTI)` — the classifier's CONTAINER rule missed these because the narrowing happens through a local helper.
- **Parser artefacts** (~7): the multi-line regex spanning an assertion boundary, e.g. `page).toHaveURL(...); await expect(...`. Reported here rather than silently dropped.

**The one real case: `scheduling.spec.ts:412`.**

```ts
await page.goto(`/marcacoes?from=${date}&to=${date}`);
await expect(page.getByText("Sem nota").first()).toBeVisible({ timeout: 8_000 });
```

**The day is not exclusive to this test.** `"a newly created appointment persists
as scheduled / pendente (W3-01)"` books MARIA on the same `RUN_DAY_BASE + 13`, so
that list holds two rows and `.first()` was choosing between them.

**It was safe, and safe for a reason that lives outside the assertion.**
`marcacoes-view.tsx:306` gates the chip on
`appt.status === "completed" && !appt.hasNote`, and maria's stays `scheduled`. So
the assertion depended on a render rule in another file rather than on anything
it stated itself. Widen that rule and `.first()` could match maria's row while
ana's status update had silently failed — **the compensating error**: our own
write fails, a foreign row satisfies the check, the suite reports a pass.

Fixed by scoping to ana's row with the repo's own idiom
(`page.locator(".glass-card", { hasText })`, proven on this exact route by
`agenda-hover` and `notes-unification`), **plus a negative arm asserting maria's
row does NOT carry the chip** — which states the per-row rule the test was
previously borrowing.

## What the number means, said carefully

**494 → 57 → one.** The card that opened this one insisted the honest number be
reported with its method and that an alarming upper bound must not be presented
as the finding. 57 is the upper bound; **one** is the finding.

And the shape of the reduction is by now familiar: three of the four groups above
are cases where the locator *looks* unscoped and the **page**, the **action**, or
a **helper** supplies the scope. A shape-match sees the locator and not the
context — the same lesson `ACC-vacuous-guard-sweep` reached from four
independent directions.

## Not covered

`apps/portal/e2e` and `apps/api` were **not** swept — this pass is
`apps/web/e2e` only, which is where the shared seeded database and the
cross-spec contamination risk live. The 17 assertions with no resolved route are
unclassified, not cleared.
