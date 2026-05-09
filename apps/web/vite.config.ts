import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@zada/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@zada/api-client": path.resolve(__dirname, "../../packages/api-client/src/index.ts"),
      "@zada/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts")
    }
  },
  server: {
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, "../..")]
    }
  }
});
