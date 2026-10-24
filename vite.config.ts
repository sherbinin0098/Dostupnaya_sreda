import { defineConfig } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";

// Результат сборки — один файл dist/index.html (как раньше): проще класть в Android-обёртку и открывать без сервера.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: { target: "es2020", outDir: "dist", assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 5000 },
  test: { environment: "jsdom", include: ["tests/**/*.test.ts"] },
});
