import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Real-Chromium test for FloatingJoystick.tsx: exercises real pointer
// capture / pointerId claiming semantics (multi-touch, isPrimary), which
// jsdom cannot reliably simulate. Matches otterly-chaotic's own
// vitest.browser.config.ts pattern (real-Chromium via @vitest/browser-playwright).
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
  },
});
