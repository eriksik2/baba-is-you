import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  root: ".",
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
