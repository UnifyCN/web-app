import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for framework-free helpers (e.g. lib/pii). Edge-function tests run
// under Deno separately (supabase/functions/**/_test.ts), so they're excluded.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", "supabase/**", ".claude/**", ".next/**"],
  },
});
