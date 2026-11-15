import type { ClaimArea } from "./claimArea.js";
import { type PointerOwnership, pointerOwnership } from "./pointerOwnership.js";

/** Angles in radians; yaw is deliberately unbounded. Renderer coordinates belong to the consumer. */
export interface LookAngles {
  yaw: number;
  pitch: number;
}
export interface LookState extends LookAngles {
  locked: boolean;
}
export interface LookInputOptions {
  element: HTMLElement;
  onChange: (angles: LookAngles) => void;
  /** Clear held movement/actions here. Heading is preserved. */
  onReset?: () => void;
  onLockChange?: (locked: boolean) => void;
  onLockError?: () => void;
  ownership?: PointerOwnership;
  /** Unique per look subsystem sharing a registry. Defaults to a unique generated name. */
  owner?: string;
  /** Applied to drag presses after host/control checks, before ownership. */
  claimArea?: ClaimArea;
  /** Opt in to unlocked primary-button mouse drag (including after lock denial). Defaults to false. */
  allowMouseDrag?: boolean;
  /** Reverse physical vertical mouse/touch deltas. Defaults to false; semantic look commands are unchanged. */
  invertY?: boolean;
  /** Radians per CSS pixel. Defaults to 0.002. */
  sensitivity?: number;
  /** Absolute pitch cap in radians, in (0, PI/2]. Defaults to PI/2. */
  pitchLimit?: number;
  initial?: LookAngles;
}
export interface LookInput {
  /** Call directly from an intentional user gesture. Never called automatically. */
  requestPointerLock(): Promise<boolean>;
  getState(): LookState;
  /** Add semantic camera angles in radians, independent of pointer sensitivity/inversion. */
  lookBy(delta: LookAngles): void;
  /** Apply to subsequent physical movement without resetting heading or held pointers. */
  setInvertY(inverted: boolean): void;
  /** Radians per CSS pixel; finite and positive. Does not reset held input. */
  setSensitivity(radiansPerPixel: number): void;
  /** Cancel held look and notify onReset, retaining heading. Also cancels pending lock. */
  reset(): void;
  /** Release this controller's resources and its lock, never another element's. Idempotent. */
  dispose(): void;
}

let nextOwner = 0;

function validateSensitivity(value: number) {
  if (!(Number.isFinite(value) && value > 0)) {
    throw new RangeError("sensitivity must be finite and positive");
  }
}

/** DOM input only: no renderer, React, storage, animation loop or automatic lock request. */
export function createLookInput({
  element,
  onChange,
  onReset,
  onLockChange,
  onLockError,
  ownership = pointerOwnership,
  owner = `look-${nextOwner++}`,
  claimArea,
  allowMouseDrag = false,
  invertY = false,
  sensitivity = 0.002,
  pitchLimit = Math.PI / 2,
  initial = { yaw: 0, pitch: 0 },
}: LookInputOptions): LookInput {
  validateSensitivity(sensitivity);
  if (!(pitchLimit > 0 && pitchLimit <= Math.PI / 2)) {
    throw new RangeError("pitchLimit must be in (0, PI/2]");
  }
  if (!Number.isFinite(initial.yaw) || !Number.isFinite(initial.pitch)) {
    throw new RangeError("initial angles must be finite");
  }
  const doc = element.ownerDocument;
  const win = doc.defaultView;
  if (!win) throw new Error("element must belong to a window");
  let angles: LookAngles = {
    yaw: initial.yaw,
    pitch: Math.max(-pitchLimit, Math.min(pitchLimit, initial.pitch)),
  };
  let locked = doc.pointerLockElement === element;
  let disposed = false;
  let drag: { id: number; x: number; y: number; pointerType: string } | undefined;
  let pending:
    | { promise: Promise<boolean>; resolve: (locked: boolean) => void; cancelled: boolean }
    | undefined;

  const dropDrag = () => {
    if (!drag) return;
    const id = drag.id;
    drag = undefined;
    if (element.hasPointerCapture?.(id)) element.releasePointerCapture(id);
    ownership.release(id, owner);
  };
  const reset = () => {
    dropDrag();
    if (pending) pending.cancelled = true;
    onReset?.();
  };
  const lookBy = (delta: LookAngles) => {
    if (disposed || !Number.isFinite(delta.yaw) || !Number.isFinite(delta.pitch)) return;
    angles = {
      yaw: angles.yaw + delta.yaw,
      pitch: Math.max(-pitchLimit, Math.min(pitchLimit, angles.pitch + delta.pitch)),
    };
    onChange({ ...angles });
  };
  const move = (x: number, y: number) => {
    lookBy({ yaw: -x * sensitivity, pitch: (invertY ? y : -y) * sensitivity });
  };
  const finish = (success: boolean) => {
    const attempt = pending;
    pending = undefined;
    attempt?.resolve(success);
    if (disposed) detachLock();
  };
  const onError = () => {
    if (!pending) return;
    reset();
    if (!disposed) onLockError?.();
    finish(false);
  };
  const onLock = () => {
    const ownsLock = doc.pointerLockElement === element;
    if (ownsLock && (disposed || pending?.cancelled)) {
      finish(false);
      doc.exitPointerLock();
      return;
    }
    if (locked !== ownsLock) {
      locked = ownsLock;
      dropDrag();
      if (!locked) reset();
      onLockChange?.(locked);
    }
    if (pending && (ownsLock || doc.pointerLockElement !== null)) {
      finish(ownsLock);
    }
  };
  const onMouse = (event: MouseEvent) => {
    if (locked) move(event.movementX, event.movementY);
  };
  const onDown = (event: PointerEvent) => {
    const acceptsPointer =
      event.pointerType === "touch" || (allowMouseDrag && event.pointerType === "mouse");
    if (drag || locked || !acceptsPointer || event.button !== 0) return;
    const target = event.target as Element;
    if (
      target.closest(
        "button,a,input,textarea,select,summary,[role='button'],[contenteditable]:not([contenteditable='false']),[data-joystick-ignore]"
      )
    )
      return;
    const rect = element.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      return;
    if (claimArea && !claimArea(event, rect)) return;
    if (!ownership.claim(event.pointerId, owner)) return;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      pointerType: event.pointerType,
    };
    if (event.pointerType === "mouse") {
      try {
        element.setPointerCapture?.(event.pointerId);
      } catch {
        dropDrag();
        return;
      }
    }
    event.preventDefault();
  };
  const onMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.pointerType === "mouse" && event.buttons === 0) {
      dropDrag();
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    move(dx, dy);
    event.preventDefault();
  };
  const onEnd = (event: PointerEvent) => {
    if (drag?.id === event.pointerId) dropDrag();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || (!drag && !locked && !pending)) return;
    reset();
    if (locked) doc.exitPointerLock();
  };
  const onBlur = () => {
    reset();
    if (locked) doc.exitPointerLock();
  };
  const unsubscribe = ownership.onRelease((id, releasedOwner) => {
    if (drag?.id === id && releasedOwner === owner) dropDrag();
  });
  // Release only our drag; unlike registry.attach, losing focus here never clears other owners.
  element.addEventListener("pointerdown", onDown);
  element.addEventListener("lostpointercapture", onEnd);
  win.addEventListener("pointermove", onMove);
  win.addEventListener("pointerup", onEnd);
  win.addEventListener("pointercancel", onEnd);
  win.addEventListener("blur", onBlur);
  doc.addEventListener("keydown", onKey);
  doc.addEventListener("mousemove", onMouse);
  doc.addEventListener("pointerlockchange", onLock);
  doc.addEventListener("pointerlockerror", onError);
  function detachLock() {
    doc.removeEventListener("pointerlockchange", onLock);
    doc.removeEventListener("pointerlockerror", onError);
  }
  return {
    getState: () => ({ ...angles, locked }),
    lookBy,
    setInvertY(inverted) {
      invertY = inverted;
    },
    setSensitivity(radiansPerPixel) {
      validateSensitivity(radiansPerPixel);
      sensitivity = radiansPerPixel;
    },
    requestPointerLock() {
      if (disposed) return Promise.resolve(false);
      if (locked) return Promise.resolve(true);
      if (pending) return pending.promise;
      let resolve!: (success: boolean) => void;
      const promise = new Promise<boolean>((done) => {
        resolve = done;
      });
      const attempt = { promise, resolve, cancelled: false };
      pending = attempt;
      if (!element.requestPointerLock) {
        onError();
        return promise;
      }
      try {
        // Older implementations return void; only lock events establish success.
        const request = element.requestPointerLock() as Promise<void> | undefined;
        request?.catch(() => {
          if (pending === attempt) onError();
        });
      } catch {
        onError();
      }
      return promise;
    },
    reset,
    dispose() {
      if (disposed) return;
      disposed = true;
      reset();
      unsubscribe();
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("lostpointercapture", onEnd);
      win.removeEventListener("pointermove", onMove);
      win.removeEventListener("pointerup", onEnd);
      win.removeEventListener("pointercancel", onEnd);
      win.removeEventListener("blur", onBlur);
      doc.removeEventListener("keydown", onKey);
      doc.removeEventListener("mousemove", onMouse);
      if (locked) {
        locked = false;
        doc.exitPointerLock();
        onLockChange?.(false);
      }
      // Keep just lock-result listeners until a pending request settles: a late grant must exit.
      if (!pending) detachLock();
    },
  };
}
