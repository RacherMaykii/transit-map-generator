import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  publicDir: "public",
  // 相对 base：静态产物部署在任意子路径（如 GitHub Pages 的 /仓库名/）也能正确加载资源
  base: "./",
  build: {
    outDir: "static-dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
