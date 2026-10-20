import { defineConfig } from "vitest/config";

// The api/ handlers on Node against a real Postgres (TEST_DATABASE_URL).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/api/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
