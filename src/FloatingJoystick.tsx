import { useEffect, useRef, useState } from "react";
import { normalizeJoystick, type JoystickVector } from "./normalizeJoystick.js";

export type { JoystickVector };

export interface FloatingJoystickProps {
  onChange: (vector: JoystickVector) => void;
  disabled?: boolean;
  /** a11y title, default "Movement joystick" */
  label?: string;
  /** px, default 58 */
  radius?: number;
  /** 0-1 fraction of radius, default 0.12 */
  deadZone?: number;
  /** CSS color, default "#38bdf8" — explicit prop only, never read from a
   * host CSS custom property (fixes the legacy atoms.tsx coupling bug). */
  accent?: string;
  /** default false — touch-only unless explicitly opted in */
  allowMouse?: boolean;
  /** CSS selector used to scope the joystick's hit-test host, generalizing
   * the legacy hardcoded '[data-testid="game-viewport"]' lookup so
   * non-arcade-cabinet consumers can scope it to their own viewport. */
  hostSelector?: string;
}

interface JoystickVisualState {
  active: boolean;
  originX: number;
  originY: number;
  knobX: number;
  knobY: number;
}

const NEUTRAL: JoystickVisualState = {
  active: false,
  originX: 0,
  originY: 0,
  knobX: 0,
  knobY: 0,
};

const NEUTRAL_VECTOR: JoystickVector = { x: 0, y: 0, magnitude: 0, angle: 0 };

const DEFAULT_HOST_SELECTOR = '[data-testid="game-viewport"]';

export function FloatingJoystick({
  onChange,
  disabled = false,
  label = "Movement joystick",
  radius = 58,
  deadZone = 0.12,
  accent = "#38bdf8",
  allowMouse = false,
  hostSelector = DEFAULT_HOST_SELECTOR,
}: FloatingJoystickProps) {
  const scopeRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const onChangeRef = useRef(onChange);
  const [visual, setVisual] = useState<JoystickVisualState>(NEUTRAL);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (disabled) {
      activePointer.current = null;
      setVisual(NEUTRAL);
      onChangeRef.current(NEUTRAL_VECTOR);
      return undefined;
    }

    const readHost = () =>
      scopeRef.current?.closest<HTMLElement>(hostSelector) ??
      scopeRef.current?.parentElement ??
      null;

    const isInsideHost = (event: PointerEvent) => {
      const host = readHost();
      if (!host) return true;
      const target = event.target;
      if (target instanceof Node && !host.contains(target)) return false;
      const rect = host.getBoundingClientRect();
      return (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      );
    };

    const isInteractiveTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      return Boolean(
        target.closest(
          "button,a,input,textarea,select,summary,[role='button'],[data-joystick-ignore='true'],[data-joystick-ignore]"
        )
      );
    };

    const updateVector = (event: PointerEvent) => {
      const rawDx = event.clientX - origin.current.x;
      const rawDy = event.clientY - origin.current.y;
      const vector = normalizeJoystick({ x: rawDx, y: rawDy }, radius, deadZone);
      const distance = Math.hypot(rawDx, rawDy);
      const clampedDistance = Math.min(radius, distance);
      const unitX = distance > 0 ? rawDx / distance : 0;
      const unitY = distance > 0 ? rawDy / distance : 0;

      setVisual({
        active: true,
        originX: origin.current.x,
        originY: origin.current.y,
        knobX: unitX * clampedDistance,
        knobY: unitY * clampedDistance,
      });
      onChangeRef.current(vector);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (activePointer.current !== null) return;
      if (event.pointerType === "mouse" && !allowMouse) return;
      if (!isInsideHost(event)) return;
      if (isInteractiveTarget(event.target)) return;
      if (event.cancelable) event.preventDefault();
      activePointer.current = event.pointerId;
      origin.current = { x: event.clientX, y: event.clientY };
      updateVector(event);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (activePointer.current !== event.pointerId) return;
      if (event.cancelable) event.preventDefault();
      updateVector(event);
    };

    const endPointer = (event: PointerEvent) => {
      if (activePointer.current !== event.pointerId) return;
      activePointer.current = null;
      setVisual(NEUTRAL);
      onChangeRef.current(NEUTRAL_VECTOR);
    };

    window.addEventListener("pointerdown", handlePointerDown, { passive: false });
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", endPointer);
    window.addEventListener("pointercancel", endPointer);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endPointer);
      window.removeEventListener("pointercancel", endPointer);
      activePointer.current = null;
      onChangeRef.current(NEUTRAL_VECTOR);
    };
  }, [allowMouse, deadZone, disabled, hostSelector, radius]);

  return (
    <div
      ref={scopeRef}
      aria-hidden={!visual.active}
      data-floating-joystick="true"
      data-joystick-ignore="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 80,
      }}
    >
      {visual.active ? (
        <div
          data-testid="floating-joystick"
          title={label}
          style={{
            position: "fixed",
            left: visual.originX,
            top: visual.originY,
            width: radius * 2,
            height: radius * 2,
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            border: `2px solid ${accent}73`,
            background: "rgba(7, 8, 10, 0.32)",
            boxShadow: `0 0 22px ${accent}3d, inset 0 0 24px rgba(255,255,255,0.08)`,
            backdropFilter: "blur(3px)",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: radius * 0.76,
              height: radius * 0.76,
              transform: `translate(calc(-50% + ${visual.knobX}px), calc(-50% + ${visual.knobY}px))`,
              borderRadius: "50%",
              background: `linear-gradient(135deg, rgba(255,255,255,0.92), ${accent})`,
              border: "2px solid rgba(255,255,255,0.72)",
              boxShadow: `0 8px 18px rgba(0,0,0,0.35), 0 0 18px ${accent}8f`,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
