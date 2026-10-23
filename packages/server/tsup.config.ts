import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", postgres: "src/postgres.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  platform: "node",
  loader: { ".sql": "text" },
});
