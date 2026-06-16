import { describe, expect, it } from "vitest";

import { isHeritageForbiddenRoute } from "./HeritageFrame";

// SPEC-v2-foundation §6.2: the clinical record editor is a hard-forbidden
// surface for the heritage frame. The guard is the defense-in-depth that refuses
// to render there even if the frame is mounted by mistake.
describe("isHeritageForbiddenRoute", () => {
  it.each([
    "/clinical/new",
    "/clinical/123",
    "/clinical/abc-def-uuid",
    "/clinical/123/edit",
  ])("forbids the clinical editor route %s", (route) => {
    expect(isHeritageForbiddenRoute(route)).toBe(true);
  });

  it.each([
    "/clinical",
    "/clinical/review",
    "/clinical/review/",
    "/dashboard",
    "/agenda",
    "/patients",
    "/login",
    undefined,
  ])("allows %s", (route) => {
    expect(isHeritageForbiddenRoute(route)).toBe(false);
  });
});
