import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import type { MouseStep } from "./tests/mouseScript";

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
      "tests/pressHoldInput.test.ts",
      "tests/pressHoldInput.browser.test.ts",
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
        // Trusted mouse input as a script of steps, positions relative to the test element's
        // top-left: the browser tests for pointer-driven behavior that dispatched events cannot
        // reproduce (clicks, pointer capture, real timing).
        async mouseScript({ page, iframe }, testId: string, steps: MouseStep[]) {
          const box = await iframe.getByTestId(testId).boundingBox();
          if (!box) throw new Error(`${testId} has no bounds`);
          for (const step of steps) {
            switch (step.type) {
              case "move":
                await page.mouse.move(box.x + step.x, box.y + step.y);
                break;
              case "down-at":
                await page.mouse.move(box.x + step.x, box.y + step.y);
                await page.mouse.down();
                break;
              case "down":
                await page.mouse.down();
                break;
              case "up":
                await page.mouse.up();
                break;
              case "wait":
                await page.waitForTimeout(step.ms);
                break;
            }
          }
        },
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
      include: [
        "src/FloatingJoystick.tsx",
        "src/lookInput.ts",
        "src/tapInput.ts",
        "src/pressObserver.ts",
        "src/pressHoldInput.ts",
      ],
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage/browser",
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
