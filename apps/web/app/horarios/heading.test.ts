import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/viewer-locations", () => ({
  viewerLocationScope: vi.fn(async () => null),
}));

import { resolveScheduleScope } from "@/lib/admin/schedule-scope";
import type { RequestContext } from "@/lib/auth/context";
import { s } from "@/lib/i18n";

import { scheduleHeadingKeys } from "./heading";

/**
 * T5 F5 (guide finding, #1462): a therapist opened Horários and read
 * "Horários da equipa" above a single card, their own. The heading now follows
 * the schedule scope that decides which cards render.
 */
describe("the Horários heading follows the schedule scope", () => {
  it("the self scope reads as the viewer's own schedule, never the team's", () => {
    const keys = scheduleHeadingKeys({ kind: "self", userId: "t1" });
    expect(s[keys.title]).toBe("O meu horário");
    expect(s[keys.subtitle]).toBe("Defina o seu horário de trabalho e as suas ausências.");
    expect(s[keys.title]).not.toBe(s["schedule.title"]);
  });

  it("a scope that lists a team keeps Horários da equipa", () => {
    for (const scope of [{ kind: "all" as const }, { kind: "locations" as const, locationIds: ["loc-1"] }]) {
      const keys = scheduleHeadingKeys(scope);
      expect(s[keys.title], scope.kind).toBe("Horários da equipa");
      expect(keys.subtitle, scope.kind).toBe("schedule.subtitle");
    }
  });

  it("the role the guide named resolves to that scope: a therapist gets the self heading, reception the team's", async () => {
    const ctx = (role: RequestContext["role"]) => ({ role, userId: `${role}-1` }) as RequestContext;

    const therapist = await resolveScheduleScope(ctx("therapist"));
    expect(s[scheduleHeadingKeys(therapist).title]).toBe("O meu horário");

    const reception = await resolveScheduleScope(ctx("reception"));
    expect(s[scheduleHeadingKeys(reception).title]).toBe("Horários da equipa");
  });
});
