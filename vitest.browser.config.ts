import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Real-Chromium test for FloatingJoystick.tsx: exercises real pointer
// capture / pointerId claiming semantics (multi-touch, isPrimary), which
// jsdom cannot reliably simulate. Real Chromium comes from @vitest/browser-playwright;
// install it with `pnpm exec playwright install chromium`.
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
