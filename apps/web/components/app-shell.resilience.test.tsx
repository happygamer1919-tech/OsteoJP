/**
 * A BIRTHDAY FAILURE NEVER TAKES THE SHELL DOWN.
 *
 * AppShell renders on every staff page. Its three best-effort reads (the
 * viewer's identity, which carries the birthday switch; the bell's count; the
 * birthday list) each degrade on failure instead of throwing, so a database
 * hiccup costs an icon or a greeting, never the page. This renders the REAL
 * AppShell with each read rejecting, and asserts the page still renders.
 *
 * What is stubbed is only what has no business running in a unit test: the
 * session, the database reads (each is the thing being made to fail), the
 * Supabase claims, next/link and next/navigation, and the client shell, which
 * is replaced by a plain wrapper that renders the user area and the page.
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  identity: null as (() => Promise<{ name: string | null; birthdayIconOn: boolean }>) | null,
  unread: null as (() => Promise<number>) | null,
  birthdays: null as (() => Promise<unknown>) | null,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  usePathname: () => "/agenda",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));
vi.mock("@/lib/auth/context", () => ({
  getRequestContext: async () => ({ tenantId: "t-1", role: "reception", userId: "u-1" }),
}));
vi.mock("@/lib/auth/password-rotation", () => ({ requiresPasswordRotation: async () => false }));
vi.mock("@/lib/auth/staff-identity", () => ({
  staffShellIdentity: vi.fn(() => h.identity!()),
  initialsFor: (name: string) => name.slice(0, 1),
}));
vi.mock("@/lib/notifications/centre", () => ({ unreadCount: vi.fn(() => h.unread!()) }));
vi.mock("@/lib/patients/birthdays", () => ({
  loadBirthdayIndication: vi.fn(() => h.birthdays!()),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { email: "ana.morais@example.test" } } }) },
  }),
}));
vi.mock("./staff-shell.client", () => ({
  StaffShellClient: ({ userArea, children }: { userArea: ReactNode; children: ReactNode }) =>
    createElement("div", { "data-testid": "shell" }, userArea, children),
}));
vi.mock("./logout-form.client", () => ({
  LogoutForm: ({ label }: { label: string }) => createElement("button", null, label),
}));

import { loadBirthdayIndication } from "@/lib/patients/birthdays";
import { AppShell } from "./app-shell";

const ROW = { id: "11111111-1111-4111-8111-111111111111", fullName: "Ana Exemplo", age: 46 };
const fail = (name: string) => async () => {
  const e = new Error("db down");
  e.name = name;
  throw e;
};

let errors: ReturnType<typeof vi.spyOn>;
const logged = (prefix: string) =>
  errors.mock.calls.filter((c: unknown[]) => String(c[0]).startsWith(prefix)).length;

async function render(): Promise<string> {
  const el = await AppShell({ children: createElement("p", { id: "page" }, "the page") });
  return renderToStaticMarkup(el);
}

beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  h.identity = async () => ({ name: "Rita Rececao", birthdayIconOn: true });
  h.unread = async () => 2;
  h.birthdays = async () => [ROW];
  vi.mocked(loadBirthdayIndication).mockClear();
});

afterEach(() => {
  errors.mockRestore();
});

describe("AppShell survives every best-effort read failing", () => {
  it("THE CONTROL: all reads succeed, the icon and the page render", async () => {
    const html = await render();
    expect(html).toContain('<p id="page">the page</p>');
    expect(html).toContain('data-testid="birthday-indicator"');
    expect(html).toContain("Rita Rececao");
    expect(errors).not.toHaveBeenCalled();
  });

  it("the BIRTHDAY LIST rejects: the page and the bell render, the icon does not, one log line", async () => {
    h.birthdays = fail("BirthdayReadError");
    const html = await render();
    expect(html).toContain('<p id="page">the page</p>');
    expect(html).toContain('href="/notificacoes"');
    expect(html).not.toContain('data-testid="birthday-indicator"');
    expect(logged("[birthdays]")).toBe(1);
  });

  it("the IDENTITY read rejects: the page renders on the email fallback, no icon, and ONE log line, not two", async () => {
    h.identity = fail("IdentityReadError");
    const html = await render();
    expect(html).toContain('<p id="page">the page</p>');
    expect(html).toContain("Ana Morais");
    expect(html).not.toContain('data-testid="birthday-indicator"');
    // No identity means no switch: the list is never asked for.
    expect(loadBirthdayIndication).not.toHaveBeenCalled();
    expect(logged("[shell]")).toBe(1);
    expect(logged("[birthdays]")).toBe(0);
  });

  it("all three reject at once: the page still renders", async () => {
    h.identity = fail("IdentityReadError");
    h.unread = fail("UnreadReadError");
    h.birthdays = fail("BirthdayReadError");
    const html = await render();
    expect(html).toContain('<p id="page">the page</p>');
    expect(html).toContain('href="/notificacoes"');
  });

  it("the switch OFF: the list is asked with false and the icon is not drawn", async () => {
    h.identity = async () => ({ name: "Rita Rececao", birthdayIconOn: false });
    h.birthdays = async () => null;
    const html = await render();
    expect(vi.mocked(loadBirthdayIndication).mock.calls[0]?.[1]).toBe(false);
    expect(html).not.toContain('data-testid="birthday-indicator"');
  });
});
