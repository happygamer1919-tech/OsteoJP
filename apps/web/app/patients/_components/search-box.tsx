"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";

const s = getStrings(DEFAULT_LOCALE);

export function SearchBox({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    startTransition(() => {
      router.push(query ? `/patients?q=${encodeURIComponent(query)}` : "/patients");
    });
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={s["patients.searchPlaceholder"]}
        className="w-80 rounded border border-border-strong px-3 py-2 text-sm outline-none focus:border-brand-teal"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand-teal px-4 py-2 text-sm font-medium text-text-inverse disabled:opacity-50"
      >
        {s["common.search"]}
      </button>
    </form>
  );
}
