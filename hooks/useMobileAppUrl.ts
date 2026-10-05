"use client";

import { useSyncExternalStore } from "react";
import { APP_STORE_URL, mobileAppUrl } from "@/lib/appLinks";

const subscribe = () => () => {};

/**
 * The mobile-app store link for this device, or null when there is none to
 * offer (Android, until a Play listing exists). The server can't see the
 * device, so it renders the App Store link and the client corrects it.
 */
export function useMobileAppUrl(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => mobileAppUrl(navigator.userAgent),
    () => APP_STORE_URL,
  );
}
