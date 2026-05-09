import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@zada/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
      "@zada/api-client": path.resolve(__dirname, "packages/api-client/src/index.ts"),
      "@zada/ui": path.resolve(__dirname, "packages/ui/src/index.ts")
    }
  }
});
