import { defineConfig } from "vitest/config";

// Scope Vitest to the app's TypeScript unit tests under src/ only. The existing
// deploy-script tests (scripts/*.test.mjs) stay on the `test:deploy` node --test
// runner and must not be picked up here.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
