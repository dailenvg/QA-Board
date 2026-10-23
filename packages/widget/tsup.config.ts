import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", next: "src/next.tsx" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  platform: "browser",
});
