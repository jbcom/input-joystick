import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Real-Chromium test for FloatingJoystick.tsx: exercises real pointer capture and pointerId
// claiming semantics (multi-touch, isPrimary), which jsdom cannot reliably simulate. Real Chromium
// comes from @vitest/browser-playwright; install it with `pnpm exec playwright install chromium`.
export default defineConfig({
  plugins: [react()],
  test: {
    include: [
      "tests/FloatingJoystick.test.tsx",
      "tests/lookInput.test.ts",
      "tests/tapInput.test.ts",
      "tests/tapInput.browser.test.ts",
      "tests/lookInput.browser.test.ts",
      // Real PointerEvent and WheelEvent coexistence of camera, stick and look. Camera coverage is
      // gated in the jsdom suite, where its listeners, observer and ownership paths are stubbed.
      "tests/cameraPanZoomInput.browser.test.tsx",
    ],
    passWithNoTests: false,
    browser: {
      enabled: true,
      headless:
        process.env.HEAVY_RENDER_HEADLESS === "1" || process.env.HEAVY_BROWSER_HEADLESS === "1",
      provider: playwright({
        launchOptions: {
          args: [
            "--mute-audio",
            ...(process.env.HEAVY_RENDER_HOST
              ? ["--use-angle=metal", "--ignore-gpu-blocklist"]
              : []),
          ],
        },
      }),
      instances: [{ browser: "chromium" }],
      commands: {
        async lockedTapMouse({ page, iframe }, drag: boolean) {
          const box = await iframe.getByTestId("locked-tap-surface").boundingBox();
          if (!box) throw new Error("Locked tap surface has no bounds");
          await page.mouse.move(box.x + 100, box.y + 100);
          await page.mouse.down();
          if (drag) {
            await page.mouse.move(box.x + 180, box.y + 100);
            await page.mouse.move(box.x + 100, box.y + 100);
          }
          await page.mouse.up();
        },
        async lookMouse({ page, iframe }, phase: "start" | "move" | "end" | "hover") {
          const box = await iframe.getByTestId("look-surface").boundingBox();
          if (!box) throw new Error("Look surface has no bounds");
          const positions = {
            start: [80, 100],
            move: [150, 130],
            end: [350, 150],
            hover: [170, 100],
          } as const;
          const [x, y] = positions[phase];
          await page.mouse.move(box.x + x, box.y + y);
          if (phase === "start") await page.mouse.down();
          if (phase === "end") await page.mouse.up();
        },
      },
    },
    coverage: {
      provider: "v8",
      include: ["src/FloatingJoystick.tsx", "src/lookInput.ts", "src/tapInput.ts"],
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage/browser",
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
