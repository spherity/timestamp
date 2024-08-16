import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    globals: true,
    include: ["./test/unit/*.spec.ts"],
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
    }
  },
});