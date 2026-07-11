"use client";

import { Badge } from "@/components/ui/Badge";
import { usePersonaLabel } from "@/lib/i18n/labels";
import type { Persona } from "@/types";

/** A pill showing the user's newcomer persona. */
export function PersonaBadge({ persona }: { persona: Persona }) {
  const personaLabel = usePersonaLabel();
  return <Badge variant="primary">{personaLabel(persona)}</Badge>;
}
