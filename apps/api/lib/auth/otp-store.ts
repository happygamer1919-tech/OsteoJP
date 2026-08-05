// W13-03 (Wave 13 LOOP 3) — the Drizzle OtpStore and trusted-device store,
// against migration 0056. PG1, Decision D.
//
// The security decisions all live in otp.ts behind the `OtpStore` seam; this is
// the persistence half and deliberately holds no policy. If you are looking for
// the attempt cap, the expiry, or why every refusal is identical, it is there.
//
// SERVICE-ROLE ONLY, per 0056. Every path here runs BEFORE a session exists, so
// there is no principal to scope by and no honest `TO patient` policy could be
// written. 0056 grants nothing to `patient` or `authenticated` and enables RLS
// with no policies, so those roles are denied at the row gate AND the table
// gate; getDbAdmin is the sanctioned path, matching the appointments store.

import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import {
  getDbAdmin,
  patientOtpCodes,
  patientTrustedDevices,
} from "@osteojp/db";

import { TRUSTED_DEVICE_TTL_MS, type OtpRecord, type OtpStore } from "./otp";

export function createDrizzleOtpStore(): OtpStore {
  return {
    async create({ tenantId, phoneHash, codeHash, expiresAt }) {
      await getDbAdmin()
        .insert(patientOtpCodes)
        .values({ tenantId, phoneHash, codeHash, expiresAt });
    },

    /**
     * The newest UNCONSUMED, UNEXPIRED code for this phone.
     *
     * Expiry is filtered in SQL as well as re-checked in otp.ts, and the
     * duplication is deliberate rather than sloppy: the index in 0056 is partial
     * on `consumed_at IS NULL`, so letting the database discard expired rows
     * keeps this query on the index instead of pulling a growing history into
     * the application. The re-check in otp.ts stays because THAT is where the
     * refusal semantics live, and a store that silently returned an expired row
     * must still be refused rather than trusted.
     *
     * ORDER BY expires_at DESC returns the most recently issued code when a
     * patient has requested more than one. The older ones simply expire; they
     * are not invalidated, because invalidating them on issue would let anyone
     * who can trigger a request cancel someone else's in-flight login.
     */
    async findLive(tenantId, phoneHash, now): Promise<OtpRecord | null> {
      const [row] = await getDbAdmin()
        .select({
          id: patientOtpCodes.id,
          phoneHash: patientOtpCodes.phoneHash,
          codeHash: patientOtpCodes.codeHash,
          attempts: patientOtpCodes.attempts,
          expiresAt: patientOtpCodes.expiresAt,
          consumedAt: patientOtpCodes.consumedAt,
        })
        .from(patientOtpCodes)
        .where(
          and(
            eq(patientOtpCodes.tenantId, tenantId),
            eq(patientOtpCodes.phoneHash, phoneHash),
            isNull(patientOtpCodes.consumedAt),
            gt(patientOtpCodes.expiresAt, now),
          ),
        )
        .orderBy(desc(patientOtpCodes.expiresAt))
        .limit(1);
      return row ?? null;
    },

    /**
     * Increment in SQL, not read-modify-write.
     *
     * `attempts = attempts + 1` is one statement under one row lock. Reading the
     * count into the application and writing it back leaves a gap in which two
     * concurrent guesses both read the same value and both write it back as one
     * — which would give an attacker a free extra attempt per race, against a
     * cap of five. The cheapest correct form is the one the database already
     * offers.
     */
    async incrementAttempts(id) {
      await getDbAdmin()
        .update(patientOtpCodes)
        .set({ attempts: sql`${patientOtpCodes.attempts} + 1` })
        .where(eq(patientOtpCodes.id, id));
    },

    /**
     * Mark consumed, and ONLY if it is not already.
     *
     * The `consumed_at IS NULL` predicate is what makes single use race-free: two
     * simultaneous redemptions of the same code both pass otp.ts's checks, but
     * only one UPDATE matches, and the loser writes nothing. Without it both
     * would "succeed" and the second would silently overwrite the first's
     * timestamp, losing when the code was actually spent.
     *
     * The caller must run this in the SAME transaction as the session mint, for
     * the reason 0054 couples a token action to its consumption record: a crash
     * between them leaves either a spent code with no session or a session with
     * a still-live code.
     */
    async consume(id, now) {
      await getDbAdmin()
        .update(patientOtpCodes)
        .set({ consumedAt: now })
        .where(and(eq(patientOtpCodes.id, id), isNull(patientOtpCodes.consumedAt)));
    },
  };
}

/* ---------------------------- trusted devices ---------------------------- */

export type TrustedDeviceStore = {
  /** Remember a device for the ruled window. */
  issue(args: {
    tenantId: string;
    patientId: string;
    deviceTokenHash: string;
    now: Date;
  }): Promise<void>;
  /** True only for a live, unrevoked, unexpired device belonging to a patient. */
  isTrusted(deviceTokenHash: string, now: Date): Promise<string | null>;
  /** Revoke one device explicitly. */
  revoke(deviceTokenHash: string, now: Date): Promise<void>;
};

export function createDrizzleTrustedDeviceStore(): TrustedDeviceStore {
  return {
    async issue({ tenantId, patientId, deviceTokenHash, now }) {
      // expiresAt is computed HERE, once, at issue. Decision D's window is 30
      // days from first trust and LOOP 3 requires that it "does not extend
      // itself silently on use", so nothing downstream ever recomputes it.
      await getDbAdmin()
        .insert(patientTrustedDevices)
        .values({
          deviceTokenHash,
          tenantId,
          patientId,
          expiresAt: new Date(now.getTime() + TRUSTED_DEVICE_TTL_MS),
        })
        .onConflictDoNothing();
    },

    /**
     * Returns the patient id when the device is trusted, else null.
     *
     * THREE CONDITIONS, ALL IN SQL: the row exists, it is not revoked, and it
     * has not expired. Returning the patient id rather than a boolean means the
     * caller cannot accidentally trust a device while attributing it to the
     * wrong patient — there is no second lookup to get wrong.
     *
     * `last_seen_at` is deliberately NOT written here. It exists for support and
     * revocation triage; writing it on every check would turn a read path into a
     * write path on every page load, and it must never become an input to
     * expiry.
     */
    async isTrusted(deviceTokenHash, now) {
      const [row] = await getDbAdmin()
        .select({ patientId: patientTrustedDevices.patientId })
        .from(patientTrustedDevices)
        .where(
          and(
            eq(patientTrustedDevices.deviceTokenHash, deviceTokenHash),
            isNull(patientTrustedDevices.revokedAt),
            gt(patientTrustedDevices.expiresAt, now),
          ),
        )
        .limit(1);
      return row?.patientId ?? null;
    },

    /**
     * Revocation sets a timestamp; it does not delete the row. "This device was
     * revoked on the 4th" stays an answerable question, which a deleted row
     * cannot answer. The IS NULL guard keeps the FIRST revocation instant.
     */
    async revoke(deviceTokenHash, now) {
      await getDbAdmin()
        .update(patientTrustedDevices)
        .set({ revokedAt: now })
        .where(
          and(
            eq(patientTrustedDevices.deviceTokenHash, deviceTokenHash),
            isNull(patientTrustedDevices.revokedAt),
          ),
        );
    },
  };
}
