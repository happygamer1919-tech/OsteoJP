/**
 * MOVED to `@osteojp/rate-limit` (SEC-r-token-no-rate-limit, 2026-08-13).
 *
 * This file is a RE-EXPORT SHIM and contains no logic. It exists so that the
 * extraction moved zero call sites in `apps/api` — including the OTP routes that
 * carry PG1 — rather than touching a gate-bearing path to save an import line.
 *
 * `apps/web` had NO limiter at all, so a copy would have meant two definitions
 * of a security control drifting apart silently. New code in either app may
 * import from `@osteojp/rate-limit` directly.
 */
export * from "@osteojp/rate-limit";
