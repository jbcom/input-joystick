import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// jsdom tests for pure logic + synthetic-KeyboardEvent-driven hooks.
// FloatingJoystick.test.tsx (real PointerEvent semantics: pointer capture,
// coalesced isPrimary/pointerId behavior) is NOT included here — jsdom's
// PointerEvent support can't drive it reliably; see vitest.browser.config.ts.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    include: ["tests/normalizeJoystick.test.ts", "tests/useKeyboardVectorMap.test.tsx"],
    passWithNoTests: false,
  },
});
