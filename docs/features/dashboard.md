# Staff Dashboard (`/dashboard`)

> Verified against `apps/web/app/dashboard/page.tsx`, `apps/web/app/dashboard/notas-rapidas.tsx`, `apps/web/lib/dashboard/notes.ts`, `apps/web/lib/dashboard/actions.ts`, `apps/web/lib/invoices/queries.ts`, `apps/web/lib/invoices/revenue-scope.ts`, `apps/web/app/dashboard/revenue-location.tsx`, `apps/web/lib/auth/viewer-locations.ts`, `apps/web/lib/scheduling/data.ts`, `packages/db/src/schema.ts`, `supabase/migrations/0018_quick_notes.sql`, and `packages/auth/permissions.ts`.

The dashboard is a server-rendered Next.js page (`apps/web/app/dashboard/page.tsx`). It accepts a `?date=YYYY-MM-DD` query parameter (defaults to today in Lisbon time) used to scope the Marcações panel to a specific day, and, for the owner only, a `?location=<location id>` parameter that holds the Receita (mês) tile to one clinic (section 2; T5b). All timestamps are stored in UTC and displayed in `Europe/Lisbon` (including DST transitions in March and October).

---

## Role visibility summary

| Widget | owner | admin | therapist | reception |
|---|---|---|---|---|
| KPI: Pacientes ativos | ✅ | ✅ | ✅ | ✅ |
| KPI: Marcações hoje | ✅ | ✅ | ✅ | ✅ |
| KPI: Novas fichas (esta semana) | ✅ | ✅ | ✅ | ✗ |
| KPI: Receita (mês) | ✅ | ✅ | ✗ | ✅ |
| Próximas marcações panel | ✅ | ✅ | ✅ | ✅ |
| Resumo semanal chart | ✅ | ✅ | ✅ | ✅ |
| Notas rápidas | ✅ | ✅ | ✅ | ✅ |

The KPI: Novas fichas card is the only widget gated on `clinical_records:read`; reception does not hold that capability.

The KPI: Receita (mês) card is gated on `invoices:issue`, which the therapist does not hold (DASH-THERAPIST-REVENUE; see section 2). Since T5b its figure is per clinic: the owner sees every clinic with a toggle for one, admin and reception see the clinics they are assigned to. The therapist's KPI row therefore has three tiles, laid out in three columns at `xl` with the third tile spanning the row at `md` and `lg`, so it has no empty column. Owner, admin and reception keep the row they had: `md:grid-cols-2 xl:grid-cols-4` with no tile spanning, which for reception's three tiles still leaves an empty quarter at `xl`.

---

## 1. Resumo semanal

**Label (PT):** "Resumo semanal"
**Component:** `<ResumoChart>` from `@osteojp/ui`, inside a `<GlassPanel>`

### What it does

Renders a 7-point line chart showing the count of non-cancelled appointments per calendar day for the current ISO week (Monday–Sunday, Lisbon timezone). The chart x-axis labels are short Portuguese weekday names derived at render time ("Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"). An all-zero series is valid (a week with no appointments is real data, not an error). If the user does not have `appointments:read` the chart section is not rendered at all (the outer `canAppointments` guard removes it).

### Data source

```
lib/scheduling/data.ts → listAppointments()
```

Called with:
- `startUtc`: Lisbon midnight of Monday of the current week
- `endUtc`: Lisbon midnight of the following Monday (exclusive)

The 7-element counts array is derived client-side from the result: for each of the 7 week days, it counts appointments where `lisbonParts(startsAt).date === weekDay` and `status !== 'cancelled'`.

### Scoping

`listAppointments` wraps every query in `runScoped(ctx, …)`, which executes under the caller's JWT and therefore under Postgres RLS. RLS restricts all reads to the caller's `tenant_id`. There is no per-user filter — the chart counts all non-cancelled appointments in the tenant for the week, regardless of which therapist they belong to.

---

## 2. Receita (mês)

**Label (PT):** "Receita (mês)"
**Component:** `<GlassKpiCard accent="gold">`, the last KPI card in the row (fourth for owner and admin, third for reception; not rendered for the therapist). For the owner it carries the clinic toggle in its `action` slot.

### What it does

Displays the total invoiced revenue for the **current calendar month**, expressed as a PT-locale EUR string (e.g. `"1.245,00 €"`), for the clinics the viewer may see (below). The value is a read-only summary with no link. The owner's card also carries the clinic toggle.

> **Gated on `invoices:issue` (DASH-THERAPIST-REVENUE).** Owner, admin and reception see the card; the therapist does not. Until this card the tile was rendered for every role, and the guide writers found a therapist's Início showing the whole clinic's monthly revenue. The gate is enforced on the server twice: the page does not call `getMonthlyRevenue` for a role without the capability (no tile, no "Sem dados"), and `getMonthlyRevenue` itself throws `ForbiddenError` before any read, so no other caller can leak the figure.
>
> The gate is `invoices:issue`, not `invoices:read`. Every role holds `invoices:read` (the therapist keeps it for the Faturação tab on a patient's page), so a gate on it would pass the therapist. `invoices:issue` is held by owner, admin and reception only, and is the capability W10-04 already uses to keep the therapist out of Faturação (`/invoicing` and its nav entry). The constant is `MONTHLY_REVENUE_CAPABILITY` in `apps/web/lib/invoices/queries.ts`, shared by the page's gate and the function's assertion.

### Data source

```
lib/invoices/queries.ts → getMonthlyRevenue(ctx, monthStartUtc, monthEndUtc, { locationId })
```

SQL (the last line only when the figure is held to clinics):
```sql
SELECT COALESCE(SUM(invoices.amount_cents), 0)::int
FROM invoices
LEFT JOIN appointments ON appointments.id = invoices.appointment_id
WHERE invoices.status IN ('issued', 'paid')
  AND invoices.issued_at IS NOT NULL
  AND invoices.issued_at >= :monthStartUtc
  AND invoices.issued_at <  :monthEndUtc
  AND appointments.location_id IN (:clinics)
```

Month boundaries are calculated as:
- `monthStartUtc`: Lisbon midnight of the 1st of the current month
- `monthEndUtc`: Lisbon midnight of the 1st of the following month (exclusive)

`issued_at` (not `created_at`) is used so draft invoices that are later voided do not distort the figure. Invoices with status `draft` or `void` are excluded.

### Scoping

`getMonthlyRevenue` first asserts `invoices:issue` (above), then reads through `runScoped(ctx, …)`: RLS on the `invoices` table restricts the sum to the caller's tenant.

**Per clinic (T5b).** The invoices RLS is tenant-wide, so the clinic scope is decided inside `getMonthlyRevenue`, never by the page. It resolves the caller's own clinics with `viewerLocationScope` (the app mirror of `viewer_location_ids()`, migration 0073) and `revenueLocations` (`lib/invoices/revenue-scope.ts`) turns role, scope and the owner's choice into the clinics the sum is held to:

| Viewer | Clinics summed |
|---|---|
| owner, no choice (default) | every clinic, and invoices with no marcação |
| owner, `?location=<id>` | that clinic only |
| admin or reception with `staff_locations` rows | exactly those clinics; `?location=` is ignored |
| admin or reception with no assignment | every clinic (the PL-09 fallback that `viewerLocationScope`, `/invoicing` and the appointments RLS already apply to this viewer) |
| therapist | refused before any read (DASH-THERAPIST-REVENUE) |

An invoice's clinic is the clinic of its marcação (`invoices.appointment_id` → `appointments.location_id`), the same link the `/invoicing` location filter and Estatísticas (`getStatistics`) use. An invoice with no marcação has no clinic: it counts in the whole-tenant figure and in no clinic's figure. The appointments RLS also runs inside the join, as defense in depth; the explicit `location_id` condition is what excludes a marcação at another clinic that an admin created themselves.

**The owner's toggle.** A `Select` from `@osteojp/ui` (`RevenueLocationToggle`, `app/dashboard/revenue-location.tsx`) under the figure, labelled "Localização da receita", first entry "Todas as localizações", then the tenant's active clinics (`listActiveLocations`, as on `/invoicing`). Choosing writes `?location=` (keeping `?date=`), and the day navigation links keep it. The page honours the id only when it is one of those active clinics, so the control and the figure always name the same thing; anything else falls back to every clinic. With a single active clinic there is nothing to choose and no toggle (PL-14). No other role sees the toggle, and `getMonthlyRevenue` ignores `?location=` for them.

**Tests.** `lib/invoices/revenue-scope.test.ts` (the decision per role), `lib/invoices/queries.test.ts` (the location ids that reach the statement), `lib/invoices/revenue.db.test.ts` (the figures per principal against a real database, RLS on), `app/dashboard/page.test.tsx` (the toggle per role) and `e2e/dashboard-revenue-per-clinic.spec.ts` (the owner toggles and the figure changes; an admin assigned to Linda-a-Velha sees only that clinic's figure).

---

## 3. Notas rápidas

**Label (PT):** "Notas rápidas"
**Component:** `<NotasRapidas>` (`apps/web/app/dashboard/notas-rapidas.tsx`), a `"use client"` component inside a `<GlassCard>`

### What it does

A plain-text textarea scratchpad that persists across sessions. The user types a note and clicks "Guardar"; the text is saved immediately via a Next.js server action and the page is revalidated. Optimistic UI via `useOptimistic` means the textarea reflects the new value instantly while the server round-trip completes. Maximum length: **2 000 characters** (enforced both client-side via `maxLength` and server-side via `rawText.slice(0, 2000)` in the action).

### Data source — table: `quick_notes`

```
packages/db/src/schema.ts → quickNotes
supabase/migrations/0018_quick_notes.sql
```

Schema (abbreviated):

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` PK | Row identifier |
| `tenant_id` | `uuid` FK → `tenants.id` | Tenant fence |
| `staff_user_id` | `uuid` FK → `users.id` | Owner of this note |
| `content` | `text` | The note text (default `''`) |
| `created_at` | `timestamptz` | First save |
| `updated_at` | `timestamptz` | Last save (auto-updated) |

Unique constraint: `(tenant_id, staff_user_id)` — exactly one row per staff member per tenant.

The server action (`lib/dashboard/actions.ts → saveQuickNotes`) performs an upsert:

```ts
tx.insert(quickNotes)
  .values({ tenantId, staffUserId, content })
  .onConflictDoUpdate({
    target: [quickNotes.tenantId, quickNotes.staffUserId],
    set: { content, updatedAt: new Date() },
  });
```

Read path (`lib/dashboard/notes.ts → getQuickNotes`):

```ts
tx.select({ content: quickNotes.content })
  .from(quickNotes)
  .where(eq(quickNotes.staffUserId, ctx.userId))
  .limit(1);
```

### Per-staff scoping (important)

Notes are **private to each individual staff member**. They are NOT shared across the team. Two staff members logged into the same clinic see independent, isolated note fields.

This is enforced at two layers:

1. **Application layer** — `getQuickNotes` filters by `ctx.userId`; `saveQuickNotes` inserts with `staffUserId: ctx.userId`.
2. **Database RLS** — the `quick_notes_own_row` policy:
   ```sql
   USING      (tenant_id = (select public.jwt_tenant_id()) AND staff_user_id = auth.uid())
   WITH CHECK (tenant_id = (select public.jwt_tenant_id()) AND staff_user_id = auth.uid())
   ```
   A staff user can only ever see or write a row where `staff_user_id = auth.uid()` — the DB will return 0 rows for any other user's note even if the app-layer filter were somehow bypassed.

> **Stale copy alert:** The JSDoc in `notas-rapidas.tsx` currently reads *"tenant-shared scratchpad"* and the placeholder text reads *"Escreva notas para a equipa…"*. Both are misleading — the implementation is per-staff, not team-shared. These strings should be corrected to avoid confusion.

---

## 4. Marcações window ("Próximas marcações")

**Label (PT):** "Próximas marcações"
**Component:** `<GlassPanel>` with an inline appointment list; footer link to `/agenda`

### What it does

Shows upcoming non-cancelled appointments in a rolling **7-day window starting from today** (i.e. `[today 00:00 Lisbon, today+7 00:00 Lisbon)`). Items are sorted ascending by `startsAt`. Two display modes per row:

- **Today's appointments** — shows `HH:MM` (Lisbon time of day).
- **Future appointments (days 2–7)** — shows `weekday + day + short month` (e.g. "ter., 24 jun.").

Each row shows: time/date, patient name, service name (or "—" if no service), and a `<StatusBadge>` coloured by appointment status:

| Status | Badge tone |
|---|---|
| `scheduled` | pending (amber) |
| `confirmed` | confirmed (green) |
| `completed` | confirmed (green) |
| `cancelled` | cancelled (red) — filtered out, never shown |
| `no_show` | cancelled (red) |

When the 7-day window contains no non-cancelled appointments, an empty state is shown with a "+ Nova Marcação" primary button linking to the agenda for today.

The panel footer always links to `/agenda` ("Ver agenda completa").

### KPI card relationship

The "Marcações hoje" KPI card (second in the row) is derived from the same `listAppointments` call — it counts only rows where `lisbonParts(startsAt).date === selectedDate`. A second caption, "Próxima: HH:MM", appears on the KPI card when viewing today and a future appointment exists within the 7-day set.

### Data source

```
lib/scheduling/data.ts → listAppointments()
```

Called with:
- `startUtc`: Lisbon midnight of today
- `endUtc`: Lisbon midnight of today + 7 days (exclusive)

No `practitionerId` or `locationId` filter is applied — the panel shows all appointments for the tenant across all therapists and locations.

### Scoping

`listAppointments` runs under `runScoped(ctx, …)` → RLS tenant fence. All four roles have `appointments:read`; the panel is not rendered at all when `can(ctx.role, 'appointments:read')` is false (which applies to no current role, but the guard is there for forward compatibility).

---

## Date navigation

The dashboard header includes prev/next day arrows and a "Hoje" button. These change the `?date=` query parameter and affect only the "Marcações hoje" KPI count (which day is counted from the 7-day set). The Resumo semanal, Receita, Notas rápidas, and the Próximas marcações panel are **not affected** by the selected date — they always reflect today's week, month, or 7-day window respectively.
