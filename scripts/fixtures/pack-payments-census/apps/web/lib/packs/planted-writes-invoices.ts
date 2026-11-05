// PLANTED OFFENDER for scripts/pack-payments-census.test.mjs, rule 1. Never
// imported, never built: a fixture the census walks to prove it fires.
export async function planted(tx: any, invoices: any, packInstancePayments: any) {
  await tx.select().from(packInstancePayments);
  await tx.insert(invoices).values({});
}
