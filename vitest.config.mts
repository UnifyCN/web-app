import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for framework-free helpers (e.g. lib/pii) and mounted component
// tests (*.test.tsx, jsdom per file). Edge-function tests run under Deno
// separately (supabase/functions/**/_test.ts, supabase/tests/**), so they're excluded.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  esbuild: { jsx: "automatic" },
  test: {
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", "supabase/**", ".claude/**", ".next/**"],
  },
});
