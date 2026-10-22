import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  // zdieľaný kód s Pages Functions (../shared) – povoliť pri vite dev
  server: { fs: { allow: [".."] } },
  build: {
    target: "es2022",
    sourcemap: true,
    // MapLibre sám má ~1 MB; varovanie pri 500 kB je pre nás iba šum
    chunkSizeWarningLimit: 1400,
  },
  // WASM čítačka .om súborov sa nemá predspracovať esbuildom
  optimizeDeps: {
    exclude: ["@openmeteo/file-reader"],
  },
  test: {
    environment: "node",
  },
});
