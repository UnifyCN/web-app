"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordPathname } from "@/lib/navigation";

/**
 * Headless. Feeds each client-side route change to the in-app history tracker so back links
 * can tell a real pop from a deep link — see `lib/navigation.ts` for why that distinction
 * matters. Mounted once in the (main) shell; renders nothing.
 */
export function NavHistoryTracker() {
  const pathname = usePathname();

  useEffect(() => {
    recordPathname(pathname);
  }, [pathname]);

  return null;
}
