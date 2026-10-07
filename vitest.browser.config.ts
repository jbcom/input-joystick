import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Real-Chromium test for FloatingJoystick.tsx: exercises real pointer capture and pointerId
// claiming semantics (multi-touch, isPrimary), which jsdom cannot reliably simulate. Real Chromium
// comes from @vitest/browser-playwright; install it with `pnpm exec playwright install chromium`.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["tests/FloatingJoystick.test.tsx"],
    passWithNoTests: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    coverage: {
      provider: "v8",
      include: ["src/FloatingJoystick.tsx"],
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage/browser",
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
