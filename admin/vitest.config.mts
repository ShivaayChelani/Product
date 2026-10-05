import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest does not read `compilerOptions.paths` from tsconfig.json, so the `@/*`
 * alias used across `src/` has to be declared here explicitly. Without it every
 * test that imports a module through `@/` fails to resolve at runtime even though
 * `tsc` and `next build` both succeed.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});