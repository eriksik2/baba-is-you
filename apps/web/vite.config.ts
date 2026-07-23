import { defineConfig } from "vite";
import path from "node:path";

/** Project Pages need `/<repo>/`; local/dev and user/org Pages use `/`. */
const base = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  root: ".",
  base,
  resolve: {
    alias: {
      "@baba/engine": path.resolve(__dirname, "../../packages/engine/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
  },
});
