"use client";

import { Tabs } from "@osteojp/ui";
import { useRouter } from "next/navigation";

// ajuda-tab.ts, never guide-routes.ts: that one imports every lesson.
import { ajudaTabHref, type AjudaTab } from "@/lib/guide/ajuda-tab";

/**
 * G1: the two parts of /ajuda, "Guia da plataforma" and "Perguntas frequentes",
 * as the packages/ui Tabs driven by the ?tab= parameter (the same pattern as
 * the patient profile's tabs). The page renders the active part on the server;
 * this only moves the address, so a tab is a link a colleague can send.
 */
export function AjudaTabs({
  current,
  items,
  label,
  panelId,
}: {
  current: AjudaTab;
  items: { value: AjudaTab; label: string }[];
  label: string;
  panelId: string;
}) {
  const router = useRouter();
  return (
    <Tabs
      aria-label={label}
      value={current}
      onValueChange={(value) => router.push(ajudaTabHref(value === "perguntas" ? "perguntas" : "guia"))}
      items={items.map((item) => ({
        value: item.value,
        label: item.label,
        // Only the active tab's panel is on the page.
        ...(item.value === current ? { "aria-controls": panelId } : {}),
      }))}
    />
  );
}
