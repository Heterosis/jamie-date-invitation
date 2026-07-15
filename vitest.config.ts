import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: { include: ["src/domain/**/*.ts", "src/integrations/**/*.ts", "src/maker/**/*.ts"] },
  },
});
