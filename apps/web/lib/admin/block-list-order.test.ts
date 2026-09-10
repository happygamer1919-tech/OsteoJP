import { describe, expect, it } from "vitest";
import { partitionBlocks } from "./block-list-order";

const b = (id: string, startDate: string, endDate = startDate) => ({ id, startDate, endDate });
const TODAY = "2026-09-10";

describe("SCHED-22 - partitionBlocks", () => {
  it("puts what is still to come first, soonest first", () => {
    const { upcoming } = partitionBlocks(
      [b("c", "2026-09-30"), b("a", "2026-09-12"), b("b", "2026-09-21")],
      TODAY,
    );
    expect(upcoming.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("orders the expired ones most-recent first", () => {
    // Looking back is almost always looking at the thing that just finished.
    const { expired } = partitionBlocks(
      [b("old", "2026-07-01"), b("recent", "2026-09-08"), b("mid", "2026-08-15")],
      TODAY,
    );
    expect(expired.map((x) => x.id)).toEqual(["recent", "mid", "old"]);
  });

  it("a block ENDING today is upcoming, not expired - the end decides, not the start", () => {
    const { upcoming, expired } = partitionBlocks([b("t", "2026-09-01", TODAY)], TODAY);
    expect(upcoming.map((x) => x.id)).toEqual(["t"]);
    expect(expired).toEqual([]);
  });

  it("THE ONE THAT MATTERS: a block that STARTED in the past but runs on is upcoming", () => {
    // A block from yesterday to next Friday is the most urgent row in the list.
    // Sorting by start buries it among last month's; collapsing by start hides
    // it outright, which is the exact way the September block stayed invisible.
    const { upcoming } = partitionBlocks(
      [b("running", "2026-09-09", "2026-09-18"), b("later", "2026-09-14")],
      TODAY,
    );
    expect(upcoming.map((x) => x.id)).toEqual(["running", "later"]);
  });

  it("the day after a block ends, it is expired", () => {
    const { upcoming, expired } = partitionBlocks([b("y", "2026-09-09", "2026-09-09")], TODAY);
    expect(upcoming).toEqual([]);
    expect(expired.map((x) => x.id)).toEqual(["y"]);
  });

  it("keeps every block - a partition loses nothing", () => {
    const all = [b("1", "2026-01-01"), b("2", "2026-12-01"), b("3", TODAY)];
    const { upcoming, expired } = partitionBlocks(all, TODAY);
    expect([...upcoming, ...expired]).toHaveLength(3);
  });

  it("handles an empty list", () => {
    expect(partitionBlocks([], TODAY)).toEqual({ upcoming: [], expired: [] });
  });
});
