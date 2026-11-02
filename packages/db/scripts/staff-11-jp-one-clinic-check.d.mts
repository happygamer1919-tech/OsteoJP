// Types for the .mjs check, so packages/db/tests/staff-11-horizon-parity.test.ts
// can import it under TypeScript strict without `any` at the import. The script
// stays plain .mjs: the owner runs it with `node` directly.

/** The portal's slot horizon in days, restated from apps/api's booking.ts. */
export const OPEN_SLOTS_HORIZON_DAYS: number;
