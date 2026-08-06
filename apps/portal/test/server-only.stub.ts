/**
 * `server-only` throws by design when it is resolved outside a React Server
 * Component graph, which is exactly what a vitest process is. Aliased in
 * `vitest.config.ts` so a server module can be unit-tested at all.
 *
 * THIS DOES NOT WEAKEN THE GUARD. The real package is still resolved by Next
 * during `next build`, which is where the boundary is actually enforced: a
 * client component importing `lib/auth/otp.ts` fails the build whether or not
 * this stub exists. The stub only stops the test runner from asserting a
 * constraint about bundling that it has no bundle to assert against.
 */
export {}
