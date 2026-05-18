import { Badge } from "@/components/ui/Badge";
import type { Persona } from "@/types";

const PERSONA_LABEL: Record<Persona, string> = {
  international_student: "International Student",
  skilled_worker: "Skilled Worker",
  refugee: "Refugee",
  other: "Newcomer",
};

/** A pill showing the user's newcomer persona. */
export function PersonaBadge({ persona }: { persona: Persona }) {
  return <Badge variant="primary">{PERSONA_LABEL[persona]}</Badge>;
}
