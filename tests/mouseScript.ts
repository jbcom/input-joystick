import { commands } from "vitest/browser";

/** One step of trusted mouse input; positions are relative to the test element's top-left. */
export type MouseStep =
  | { type: "move"; x: number; y: number }
  | { type: "down-at"; x: number; y: number }
  | { type: "down" | "up" }
  | { type: "wait"; ms: number };

declare module "vitest/browser" {
  interface BrowserCommands {
    mouseScript(testId: string, steps: MouseStep[]): Promise<void>;
  }
}

/** Drive the real mouse over the element with `data-testid` set to `testId`. */
export const mouseScript = (testId: string, steps: MouseStep[]) =>
  commands.mouseScript(testId, steps);
