import { DatePicker, Select } from "@osteojp/ui";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T5b: the two client navigations on Inicio that carry the day and the
 * owner's clinic across each other. The owner's revenue figure follows
 * `?location=`, and the day the rest of Inicio shows follows `?date=`; each
 * control must keep the OTHER parameter when it navigates, or the figure
 * quietly goes back to every clinic, or the day quietly goes back to today.
 *
 *   - RevenueLocationToggle (revenue-location.tsx): choosing a clinic keeps an
 *     explicit `?date=`.
 *   - DateJump (date-jump.tsx): picking a day keeps `&location=`.
 *
 * page.test.tsx renders static markup, where no onChange ever runs, and
 * replaces DateJump with a stub; this file is where both onChange handlers run.
 *
 * HOW A CHANGE IS TESTED WITHOUT A DOM. This suite has no jsdom (vitest runs in
 * node). Both components are called as plain functions with their hooks
 * replaced: useRouter (next/navigation) records the push, and useTransition
 * runs the transition at once. The returned element is searched for the
 * control and its onChange is invoked, as service-filter.test.tsx presses a
 * button. Everything else in both components is the real code.
 *
 * IT IS NOT EVIDENCE ABOUT A SCREEN. That the owner's real clicks and typing
 * produce these URLs on the running app is
 * e2e/dashboard-revenue-per-clinic.spec.ts's question.
 */

const nav = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push }) }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useTransition: () => [false, (run: () => void) => run()],
}));

import { DateJump } from "./date-jump";
import { RevenueLocationToggle } from "./revenue-location";

const LV = { id: "00000000-0000-0000-0000-0000000000a1", name: "Linda-a-Velha" };
const CB = { id: "00000000-0000-0000-0000-0000000000c2", name: "Castelo Branco" };

/** Every element in a returned tree, depth first. */
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  const out: ReactElement<Record<string, unknown>>[] = [];
  const walk = (n: ReactNode) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!isValidElement(n)) return;
    const el = n as ReactElement<Record<string, unknown>>;
    out.push(el);
    walk(el.props.children as ReactNode);
  };
  walk(node);
  return out;
}

/** The one element of `type` in the tree, so a second one fails loudly. */
function only(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> {
  const found = elements(node).filter((el) => el.type === type);
  expect(found).toHaveLength(1);
  return found[0]!;
}

beforeEach(() => {
  nav.push.mockReset();
});

describe("RevenueLocationToggle: choosing keeps the page's explicit ?date=", () => {
  function choose(props: { value: string | null; date: string | null }, chosen: string): void {
    const tree = RevenueLocationToggle({ locations: [CB, LV], ...props });
    const select = only(tree, Select);
    (select.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: chosen } });
  }

  it("a clinic, from a page with ?date=: the day and the clinic", () => {
    choose({ value: null, date: "2026-03-17" }, LV.id);
    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(nav.push).toHaveBeenCalledWith(`/dashboard?date=2026-03-17&location=${LV.id}`);
  });

  it("another clinic, from ?date= and a clinic: the day stays, the clinic changes", () => {
    choose({ value: LV.id, date: "2026-03-17" }, CB.id);
    expect(nav.push).toHaveBeenCalledWith(`/dashboard?date=2026-03-17&location=${CB.id}`);
  });

  it("every clinic, from ?date= and a clinic: the day stays, the clinic goes", () => {
    choose({ value: LV.id, date: "2026-03-17" }, "");
    expect(nav.push).toHaveBeenCalledWith("/dashboard?date=2026-03-17");
  });

  it("a clinic, from a page with no ?date=: the clinic alone, so the day stays today", () => {
    choose({ value: null, date: null }, CB.id);
    expect(nav.push).toHaveBeenCalledWith(`/dashboard?location=${CB.id}`);
  });

  it("every clinic, from a page with no ?date=: plain /dashboard", () => {
    choose({ value: CB.id, date: null }, "");
    expect(nav.push).toHaveBeenCalledWith("/dashboard");
  });

  it("shows the clinic it was given, and every clinic for null", () => {
    const one = only(RevenueLocationToggle({ locations: [CB, LV], value: LV.id, date: null }), Select);
    expect(one.props.value).toBe(LV.id);
    const all = only(RevenueLocationToggle({ locations: [CB, LV], value: null, date: null }), Select);
    expect(all.props.value).toBe("");
  });
});

describe("DateJump: picking a day keeps the owner's clinic", () => {
  function pick(location: string | null | undefined, day: string): void {
    const tree = DateJump({ date: "2026-03-17", label: "Escolher data", location });
    const picker = only(tree, DatePicker);
    (picker.props.onChange as (v: string) => void)(day);
  }

  it("with a chosen clinic: the new day and the same clinic", () => {
    pick(CB.id, "2026-03-19");
    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(nav.push).toHaveBeenCalledWith(`/dashboard?date=2026-03-19&location=${CB.id}`);
  });

  it("with no clinic (every clinic, or a role with no toggle): the new day alone", () => {
    pick(null, "2026-03-19");
    pick(undefined, "2026-03-20");
    expect(nav.push.mock.calls).toEqual([["/dashboard?date=2026-03-19"], ["/dashboard?date=2026-03-20"]]);
  });

  it("a cleared field navigates nowhere", () => {
    pick(CB.id, "");
    expect(nav.push).not.toHaveBeenCalled();
  });
});
