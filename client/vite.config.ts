import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

// Hashed assets under /static/; the server reads the manifest to link them.
export default defineConfig({
  root: import.meta.dirname,
  base: "/static/",
  plugins: [preact()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    manifest: true,
    rollupOptions: { input: "src/main.tsx" },
  },
});
