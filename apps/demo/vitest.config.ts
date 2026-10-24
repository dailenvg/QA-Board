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
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.ts"],
    restoreMocks: true,
  },
});
