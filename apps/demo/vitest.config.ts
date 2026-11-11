import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Mirrors the webpack `asset/source` rule so `import sql from "./x.sql"` works in tests. */
const sqlAsText = {
  name: "sql-as-text",
  transform(code: string, id: string) {
    return id.endsWith(".sql") ? `export default ${JSON.stringify(code)};` : null;
  },
};

export default defineConfig({
  plugins: [sqlAsText],
  // tsconfig keeps JSX for Next to compile; tests that render components need it compiled here.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.ts"],
    restoreMocks: true,
    // PGlite boots Postgres in WebAssembly and every database runs all migrations; with Argon2
    // hashing on top, a cold test can pass 5s while turbo runs the packages in parallel.
    testTimeout: 20_000,
  },
});
