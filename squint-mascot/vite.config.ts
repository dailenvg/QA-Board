import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * On Vercel the kit is served under /mascot and receives that path unchanged,
 * so builds use it as the base and write into dist/mascot to match. Local dev
 * stays at the root.
 */
const BASE = "/mascot/";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? BASE : "/",
  build: { outDir: `dist${BASE}`, emptyOutDir: true },
  server: { port: 5178 },
}));
