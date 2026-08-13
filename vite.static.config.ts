import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  publicDir: "public",
  build: {
    outDir: "static-dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
