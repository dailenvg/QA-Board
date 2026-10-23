import { defineConfig } from "vitest/config";

/** Mirrors the tsup text loader so `import sql from "./x.sql"` works in tests. */
const sqlAsText = {
  name: "sql-as-text",
  transform(code: string, id: string) {
    return id.endsWith(".sql") ? `export default ${JSON.stringify(code)};` : null;
  },
};

export default defineConfig({
  plugins: [sqlAsText],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
  },
});
