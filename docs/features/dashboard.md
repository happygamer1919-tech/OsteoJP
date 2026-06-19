# Staff Dashboard (`/dashboard`)

> Verified against `apps/web/app/dashboard/page.tsx`, `apps/web/app/dashboard/notas-rapidas.tsx`, `apps/web/lib/dashboard/notes.ts`, `apps/web/lib/dashboard/actions.ts`, `apps/web/lib/invoices/queries.ts`, `apps/web/lib/scheduling/data.ts`, `packages/db/src/schema.ts`, `supabase/migrations/0018_quick_notes.sql`, and `packages/auth/permissions.ts`.

The dashboard is a server-rendered Next.js page (`apps/web/app/dashboard/page.tsx`). It accepts a `?date=YYYY-MM-DD` query parameter (defaults to today in Lisbon time) used to scope the Marcações panel to a specific day. All timestamps are stored in UTC and displayed in `Europe/Lisbon` (including DST transitions in March and October).

---

## Role visibility summary

| Widget | owner | admin | therapist | reception |
|---|---|---|---|---|
| KPI — Pacientes ativos | ✅ | ✅ | ✅ | ✅ |
| KPI — Marcações hoje | ✅ | ✅ | ✅ | ✅ |
| KPI — Novas fichas (esta semana) | ✅ | ✅ | ✅ | — |
| KPI — Receita (mês) | ✅ | ✅ | ✅ | ✅ |
| Próximas marcações panel | ✅ | ✅ | ✅ | ✅ |
| Resumo semanal chart | ✅ | ✅ | ✅ | ✅ |
| Notas rápidas | ✅ | ✅ | ✅ | ✅ |

The KPI — Novas fichas card is the only widget gated on `clinical_records:read`; reception does not hold that capability.

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
**Component:** `<GlassKpiCard accent="gold">` — KPI card, fourth in the row

### What it does

Displays the total invoiced revenue for the **current calendar month**, expressed as a PT-locale EUR string (e.g. `"1.245,00 €"`). The value is a read-only summary; there is no link or action attached to the card.

> **Note:** As of the current implementation the card is not gated by any role capability check — it is always rendered for all authenticated staff. This is intentional: the card shows an aggregate figure without exposing individual invoice records.

### Data source

```
lib/invoices/queries.ts → getMonthlyRevenue(ctx, monthStartUtc, monthEndUtc)
```

SQL:
```sql
SELECT COALESCE(SUM(amount_cents), 0)::int
FROM invoices
WHERE status IN ('issued', 'paid')
  AND issued_at IS NOT NULL
  AND issued_at >= :monthStartUtc
  AND issued_at <  :monthEndUtc
```

Month boundaries are calculated as:
- `monthStartUtc`: Lisbon midnight of the 1st of the current month
- `monthEndUtc`: Lisbon midnight of the 1st of the following month (exclusive)

`issued_at` (not `created_at`) is used so draft invoices that are later voided do not distort the figure. Invoices with status `draft` or `void` are excluded.

### Scoping

`runScoped(ctx, …)` → RLS on the `invoices` table restricts the sum to the caller's tenant. No per-user filter; the value reflects all invoiced revenue across the whole clinic for the month.

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
