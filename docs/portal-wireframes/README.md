# Patient Portal — Wireframes

Low-fi Excalidraw wireframes for all 12 patient portal screens.
PT-first. Mobile viewport 390×844 (iPhone 14 base).
Brand tokens: teal `#45B9A7`, magenta `#8B1863`.

Open any `.excalidraw` file at [excalidraw.com](https://excalidraw.com) — drag and drop.

## Screens

| File | Screen | Route | Auth |
|---|---|---|---|
| `01-login.excalidraw` | Login / magic link | `/auth/login` | Public |
| `02-activate.excalidraw` | Activate account | `/auth/activate` | Public (token) |
| `03-dashboard.excalidraw` | Dashboard | `/portal/dashboard` | Required |
| `04-booking-service.excalidraw` | Book — step 1: service | `/portal/booking` | Required |
| `05-booking-slot.excalidraw` | Book — step 2: location + slot | `/portal/booking/slot` | Required |
| `06-booking-confirm.excalidraw` | Book — step 3: confirm | `/portal/booking/confirm` | Required |
| `07-appointments.excalidraw` | Appointments list | `/portal/appointments` | Required |
| `08-forms.excalidraw` | Forms list (fichas) | `/portal/forms` | Required |
| `09-form-fill.excalidraw` | Form fill — JSON schema renderer | `/portal/forms/[id]` | Required |
| `10-documents.excalidraw` | Documents | `/portal/documents` | Required |
| `11-clinics.excalidraw` | Clinics (both locations) | `/portal/clinics` | Public |
| `12-account.excalidraw` | Account + reminder prefs | `/portal/account` | Required |

## Notes

- **Booking flow** is 3 steps (service → location+slot → confirm). Step 4 (payment) deferred to Phase 4.
- **Forms**: 7 templates. NESA fields pending JP sign-off. RPG, massagem, pilates use the physiotherapy form base.
- **Documents**: declaração de presença, declaração de tratamento, fatura-recibo. NIF 510.200.427 on all.
- **Reminder toggles** (screen 12): email/SMS on-off + lead-time selector. Persistence requires Ivan adding `reminder_preferences` column to DB.
- **Clinics page** (screen 11): public, no auth. Both locations with real contact data.
- These wireframes are the source of truth for Wave C UI implementation by Ivan.
