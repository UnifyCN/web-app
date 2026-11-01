// @vitest-environment jsdom
// The real task entry must hydrate without replacing a draft or its focus.
// The external session remains pending, as it can during a hard navigation.
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanionTasksEntry } from "./TaskActionsDrawer";
import en from "@/lib/i18n/locales/en/translation.json";

vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  createClient: () => ({
    auth: {
      getSession: () => new Promise(() => {}),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  }),
}));

const originalOnline = Object.getOwnPropertyDescriptor(navigator, "onLine");
const originalActEnvironment = Object.getOwnPropertyDescriptor(
  globalThis,
  "IS_REACT_ACT_ENVIRONMENT",
);
let root: Root | undefined;
let queryClient: QueryClient | undefined;
let container: HTMLDivElement | undefined;

function setOnline(value: boolean | undefined) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  queryClient?.clear();
  queryClient = undefined;
  container?.remove();
  container = undefined;
  if (originalOnline)
    Object.defineProperty(navigator, "onLine", originalOnline);
  else Reflect.deleteProperty(navigator, "onLine");
  if (originalActEnvironment)
    Object.defineProperty(
      globalThis,
      "IS_REACT_ACT_ENVIRONMENT",
      originalActEnvironment,
    );
  else Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
});

describe("Companion task entry hydration", () => {
  it.each([true, false])(
    "keeps a draft and focus when the browser is online=%s",
    async (connected) => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      const i18n = createInstance();
      await i18n.use(initReactI18next).init({
        lng: "en",
        resources: { en: { translation: en } },
        initImmediate: false,
        interpolation: { escapeValue: false },
      });
      queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity } },
      });
      const page = (
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <main>
              <CompanionTasksEntry onOpen={() => {}} />
              <input aria-label="Companion draft" defaultValue="" />
            </main>
          </I18nextProvider>
        </QueryClientProvider>
      );
      setOnline(undefined);
      const html = renderToString(page);
      container = document.createElement("div");
      container.innerHTML = html;
      document.body.append(container);
      const draft = container.querySelector("input");
      expect(draft).not.toBeNull();
      draft!.value = "Keep this draft";
      draft!.focus();

      setOnline(connected);
      const onRecoverableError = vi.fn();
      await act(async () => {
        root = hydrateRoot(container!, page, { onRecoverableError });
      });

      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(container.querySelector("input")).toBe(draft);
      expect(draft!.value).toBe("Keep this draft");
      expect(document.activeElement).toBe(draft);
      expect(container.textContent).toContain(
        connected ? "Loading task progress" : "In progress: 0",
      );
      expect(html).toContain("Loading task progress");

      await act(async () => {
        setOnline(false);
        window.dispatchEvent(new Event("offline"));
      });
      expect(container.textContent).toContain("In progress: 0");
      await act(async () => {
        setOnline(true);
        window.dispatchEvent(new Event("online"));
      });
      expect(container.textContent).toContain("Loading task progress");
      expect(container.querySelector("input")).toBe(draft);
      expect(draft!.value).toBe("Keep this draft");
      expect(document.activeElement).toBe(draft);
      expect(onRecoverableError).not.toHaveBeenCalled();
    },
  );
});
