import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    globals: false,
    pool: "forks",
    reporters: ["default"],
    testTimeout: 2000,
    hookTimeout: 2000
  }
});
