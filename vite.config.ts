import { defineConfig } from "vite";

export default defineConfig({
  root: "src/client",
  server: {
    host: "0.0.0.0",
    proxy: { "/ws": { target: "ws://127.0.0.1:8080", ws: true } },
  },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
});
