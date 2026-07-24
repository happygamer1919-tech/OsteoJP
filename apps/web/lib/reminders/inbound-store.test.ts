import { describe, expect, it } from "vitest";

import { listReviewQueue, resolveReviewItem } from "./inbound-store";

// The inbound store is a STUB until its migration lands: reads return an empty
// queue, resolves are no-ops. These lock that contract so the review UI has a
// stable, schema-free surface to build against.

describe("inbound-store stub (migration deferred)", () => {
  it("listReviewQueue returns an empty queue for any tenant", async () => {
    await expect(listReviewQueue("tenant-a")).resolves.toEqual([]);
    await expect(listReviewQueue("tenant-b")).resolves.toEqual([]);
  });

  it("resolveReviewItem is a no-op that resolves without throwing", async () => {
    await expect(
      resolveReviewItem({ tenantId: "tenant-a", itemId: "in-1", resolution: "confirmed" }),
    ).resolves.toBeUndefined();
    await expect(
      resolveReviewItem({ tenantId: "tenant-a", itemId: "in-1", resolution: "read" }),
    ).resolves.toBeUndefined();
  });
});
