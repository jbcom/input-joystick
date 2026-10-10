import { useEffect, useId, useRef, useState } from "react";
import type { ClaimArea, ClaimRect } from "./claimArea.js";
import { type JoystickVector, normalizeJoystick } from "./normalizeJoystick.js";
import { type PointerOwnership, pointerOwnership } from "./pointerOwnership.js";

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
  /** Hex color, default "#38bdf8". Explicit prop only, never read from a
   * host CSS custom property. */
  accent?: string;
  /** default false — touch-only unless explicitly opted in */
  allowMouse?: boolean;
  /** CSS selector for the closest ancestor used as the hit-test host.
   * Default '[data-testid="game-viewport"]'; falls back to the parent element. */
  hostSelector?: string;
  /** Which presses inside the host the stick may claim: called with the
   * `pointerdown` and the host's rectangle, after the host and interactive
   * checks. A press it rejects is left alone for look, drag or taps. Default:
   * the whole host. See `claimWidthFraction`. Read through a ref, so an inline
   * function does not re-attach listeners. */
  claimArea?: ClaimArea;
  /** The registry the stick claims its pointer in, so a pointer another owner
   * holds is never taken and one the stick holds is not offered to others.
   * Default: the shared `pointerOwnership`. */
  ownership?: PointerOwnership;
  /** The name the stick claims under in `ownership`; default `"joystick:"` and a per-instance id. */
  owner?: string;
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
const DEFAULT_OWNER = "joystick";

export function FloatingJoystick({
  onChange,
  disabled = false,
  label = "Movement joystick",
  radius = 58,
  deadZone = 0.12,
  accent = "#38bdf8",
  allowMouse = false,
  hostSelector = DEFAULT_HOST_SELECTOR,
  claimArea,
  ownership = pointerOwnership,
  owner: ownerProp,
}: FloatingJoystickProps) {
  // Each stick claims under its own name, so two default sticks (a dual-stick layout) never both
  // take one pointer: the registry treats a claim by the owner already holding it as granted.
  const defaultOwner = `${DEFAULT_OWNER}:${useId()}`;
  const owner = ownerProp ?? defaultOwner;
  const scopeRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const onChangeRef = useRef(onChange);
  const claimAreaRef = useRef(claimArea);
  const [visual, setVisual] = useState<JoystickVisualState>(NEUTRAL);

  useEffect(() => {
    onChangeRef.current = onChange;
    claimAreaRef.current = claimArea;
  }, [onChange, claimArea]);

  useEffect(() => {
    if (disabled) {
      activePointer.current = null;
      setVisual(NEUTRAL);
      onChangeRef.current(NEUTRAL_VECTOR);
      return undefined;
    }

    // Effects run after commit, so the wrapper is always mounted here.
    const scope = scopeRef.current as HTMLDivElement;
    const readHost = () => scope.closest<HTMLElement>(hostSelector) ?? scope.parentElement;

    // The host's rectangle when the press is inside the host, otherwise null. A stick with no
    // host at all (rendered into a detached fragment) treats the viewport as its host.
    const hostRectFor = (event: PointerEvent): ClaimRect | null => {
      const host = readHost();
      if (!host) {
        const { innerWidth: width, innerHeight: height } = window;
        return { left: 0, top: 0, right: width, bottom: height, width, height };
      }
      const target = event.target;
      if (target instanceof Node && !host.contains(target)) return null;
      const rect = host.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      return inside ? rect : null;
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
      const rect = hostRectFor(event);
      if (!rect) return;
      if (isInteractiveTarget(event.target)) return;
      if (claimAreaRef.current && !claimAreaRef.current(event, rect)) return;
      // Last, so a press the stick would not take anyway never holds a claim.
      if (!ownership.claim(event.pointerId, owner)) return;
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

    // The one way a gesture ends: pointer up or cancel, a claim released from the registry
    // (window blur, a scene reset), disabled and unmount all land here.
    const endGesture = (pointerId: number) => {
      if (activePointer.current !== pointerId) return;
      activePointer.current = null;
      ownership.release(pointerId, owner);
      setVisual(NEUTRAL);
      onChangeRef.current(NEUTRAL_VECTOR);
    };

    const endPointer = (event: PointerEvent) => endGesture(event.pointerId);

    // The registry releases claims on pointer end and blur; hearing about it here keeps the
    // stick from steering on a pointer it no longer owns.
    const detach = ownership.attach();
    const unwatch = ownership.onRelease(endGesture);

    window.addEventListener("pointerdown", handlePointerDown, { passive: false });
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", endPointer);
    window.addEventListener("pointercancel", endPointer);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endPointer);
      window.removeEventListener("pointercancel", endPointer);
      unwatch();
      detach();
      if (activePointer.current !== null) ownership.release(activePointer.current, owner);
      activePointer.current = null;
      onChangeRef.current(NEUTRAL_VECTOR);
    };
  }, [allowMouse, deadZone, disabled, hostSelector, radius, ownership, owner]);

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
