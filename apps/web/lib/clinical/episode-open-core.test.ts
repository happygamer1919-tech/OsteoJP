import { describe, expect, it } from "vitest";
import { ROLES } from "@osteojp/auth";
import { decideOpenEpisode, mayOpenEpisode } from "./episode-open-core";

const OPEN = "7777abcd-7777-4777-8777-777777777771";
const OTHER = "7777abcd-7777-4777-8777-777777777772";

describe("mayOpenEpisode (EPI-01b, piece 2): who '+ Episódio' is for", () => {
  it("the therapist, and no other role the platform has", () => {
    expect(mayOpenEpisode("therapist")).toBe(true);
    const others = ROLES.filter((r) => r !== "therapist");
    // Positive control: the list really holds the roles that must be refused.
    expect(others).toEqual(expect.arrayContaining(["owner", "admin", "reception"]));
    for (const role of others) expect(mayOpenEpisode(role), role).toBe(false);
  });
});

describe("decideOpenEpisode: an open episode of the specialty is shown before another is opened", () => {
  it("none open: open one, whatever the confirmation says", () => {
    expect(decideOpenEpisode(null, null)).toEqual({ kind: "create" });
    expect(decideOpenEpisode(null, undefined)).toEqual({ kind: "create" });
    expect(decideOpenEpisode(null, OPEN)).toEqual({ kind: "create" });
  });

  it("one open and no confirmation: open nothing, and name it", () => {
    expect(decideOpenEpisode(OPEN, null)).toEqual({ kind: "confirm", episodeId: OPEN });
    expect(decideOpenEpisode(OPEN, undefined)).toEqual({ kind: "confirm", episodeId: OPEN });
    expect(decideOpenEpisode(OPEN, "")).toEqual({ kind: "confirm", episodeId: OPEN });
  });

  it("one open and the confirmation names it: open another", () => {
    expect(decideOpenEpisode(OPEN, OPEN)).toEqual({ kind: "create" });
  });

  it("the confirmation names a DIFFERENT episode: open nothing, and name the one open now", () => {
    expect(decideOpenEpisode(OPEN, OTHER)).toEqual({ kind: "confirm", episodeId: OPEN });
    expect(decideOpenEpisode(OTHER, OPEN)).toEqual({ kind: "confirm", episodeId: OTHER });
  });

  it("ids are compared as uuids, not as text: either side in uppercase is the same episode", () => {
    expect(OPEN.toUpperCase()).not.toBe(OPEN);
    expect(decideOpenEpisode(OPEN, OPEN.toUpperCase())).toEqual({ kind: "create" });
    expect(decideOpenEpisode(OPEN.toUpperCase(), OPEN)).toEqual({ kind: "create" });
  });

  it("a confirmation that is not a string confirms nothing", () => {
    for (const bad of [true, 1, {}, [OPEN]]) {
      expect(decideOpenEpisode(OPEN, bad as never)).toEqual({ kind: "confirm", episodeId: OPEN });
    }
  });
});
