import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    globalSetup: ["./test/integration/setup/globalSetup.ts"],
    setupFiles: ["./test/integration/setup/setup.ts"],
    include: ["./test/integration/*.integration.spec.ts"],
    testTimeout: 20000,
  },
});
