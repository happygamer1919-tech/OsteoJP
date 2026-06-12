"use client";

import { Tabs } from "@osteojp/ui";
import { useRouter } from "next/navigation";

/** Patient-profile tabs (W2-05): the W1-06 Tabs driven by the ?tab query param. */
export function ProfileTabs({
  patientId,
  current,
  items,
  label,
}: {
  patientId: string;
  current: string;
  items: { value: string; label: string }[];
  label: string;
}) {
  const router = useRouter();
  return (
    <Tabs
      aria-label={label}
      value={current}
      onValueChange={(v) => router.push(`/patients/${patientId}?tab=${v}`)}
      items={items}
    />
  );
}
