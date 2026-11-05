import { s } from "@/lib/i18n";
import { isClosedDayKind, type ClosedDayKind } from "./closed-days-core";

/** The pt-PT/en-GB name of each closure kind, from i18n. */
export function closedDayKindLabel(kind: ClosedDayKind): string {
  switch (kind) {
    case "feriado_nacional":
      return s["closures.kind.feriadoNacional"];
    case "feriado_municipal":
      return s["closures.kind.feriadoMunicipal"];
    case "encerramento":
      return s["closures.kind.encerramento"];
    case "outro":
      return s["closures.kind.outro"];
  }
}

/**
 * The reason a closure gives on screen: its own label when it has one ("Natal"),
 * else the name of its kind ("Feriado nacional"). A kind the code does not
 * know reads as "Outro" rather than as a raw database value.
 */
export function closedDayReason(kind: string, label: string | null): string {
  const trimmed = (label ?? "").trim();
  if (trimmed !== "") return trimmed;
  return closedDayKindLabel(isClosedDayKind(kind) ? kind : "outro");
}
