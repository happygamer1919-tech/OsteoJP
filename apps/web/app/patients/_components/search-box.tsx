"use client";

import { Field, Input } from "@osteojp/ui";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

const s = getStrings(DEFAULT_LOCALE);

const DEBOUNCE_MS = 300;

export function SearchBox({
  initialQuery,
  path = "/patients",
  placeholder = s["patients.searchPlaceholder"],
}: {
  initialQuery: string;
  /** Route the ?q= filter param is written to (W5-02: reused beyond /patients). */
  path?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQuery);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function navigate(value: string) {
    const query = value.trim();
    // Preserve sibling filter params (e.g. W5-32 ?location=) so search composes
    // with them instead of clobbering them; only the `q` param is (re)written.
    const params = new URLSearchParams(searchParams.toString());
    if (query) params.set("q", query);
    else params.delete("q");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${path}?${qs}` : path);
    });
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate(value), DEBOUNCE_MS);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (timer.current) clearTimeout(timer.current);
    navigate(q);
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <form onSubmit={onSubmit} role="search">
      {/* The visible affordance is the placeholder + Search icon; the label is
          present for AA association but visually hidden (§11.1). */}
      <Field label={<span className="sr-only">{s["common.search"]}</span>}>
        <Input
          type="search"
          name="q"
          value={q}
          onChange={onChange}
          leadingIcon={Search}
          placeholder={placeholder}
        />
      </Field>
    </form>
  );
}
