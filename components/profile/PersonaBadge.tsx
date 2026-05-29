import { Badge } from "@/components/ui/Badge";
import { PERSONA_LABEL } from "@/lib/onboarding/constants";
import type { Persona } from "@/types";

/** A pill showing the user's newcomer persona. */
export function PersonaBadge({ persona }: { persona: Persona }) {
  return <Badge variant="primary">{PERSONA_LABEL[persona]}</Badge>;
}
