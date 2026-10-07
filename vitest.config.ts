import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// jsdom tests for pure logic and the synthetic-KeyboardEvent hook, plus the repository contract.
// FloatingJoystick.test.tsx (real PointerEvent semantics: pointer capture, isPrimary/pointerId
// claiming) is NOT included here: jsdom's PointerEvent support cannot drive it reliably, so it runs
// in real Chromium; see vitest.browser.config.ts.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    include: [
      "tests/normalizeJoystick.test.ts",
      "tests/useKeyboardVectorMap.test.tsx",
      "tests/repository-contract.test.ts",
    ],
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      include: ["src/normalizeJoystick.ts", "src/useKeyboardVectorMap.ts"],
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage/jsdom",
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
