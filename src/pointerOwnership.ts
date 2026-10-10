/**
 * Who owns which pointer. A finger that goes down on a station, a button
 * widget or the joystick belongs to that subsystem until it lifts; nobody else
 * may also treat it as a look-drag, a stick or a tap. This module is plain
 * TypeScript with no React and no required DOM, so any subsystem (or a game
 * with its own renderer) can share one registry with the joystick.
 */

/** The window-like target a registry listens on to release pointers it no longer owns. */
export type PointerOwnershipTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

/** Called after a claim ends, whatever the cause: an explicit release, pointer end, blur. */
export type PointerReleaseListener = (pointerId: number, owner: string) => void;

export interface PointerOwnership {
  /**
   * Take a pointer for `owner`. Returns `true` when the pointer was free or
   * already belongs to `owner` (so it is safe to call again), and `false` when
   * another owner holds it; a refused claim changes nothing.
   */
  claim(pointerId: number, owner: string): boolean;
  /**
   * Give a pointer back. With `owner`, only that owner's claim is released, so
   * one subsystem can never drop another's pointer. Returns whether a claim
   * was released; releasing a free pointer is a no-op that returns `false`.
   */
  release(pointerId: number, owner?: string): boolean;
  /** Release every pointer `owner` holds. Returns how many were released. */
  releaseAll(owner: string): number;
  /** The owner of a pointer, or `undefined` when it is free. */
  ownerOf(pointerId: number): string | undefined;
  /** Release every claim, for every owner (a lost window focus, a scene reset). */
  clear(): void;
  /** Subscribe to releases. Returns the unsubscribe function. */
  onRelease(listener: PointerReleaseListener): () => void;
  /**
   * Start releasing claims on their own: a claimed pointer is released when
   * `pointerup` or `pointercancel` reaches `target` (default `window`), and
   * every claim is released on `blur`. The listeners are reference-counted per
   * target, so any number of subsystems can attach and the listeners go when
   * the last one detaches. Returns the detach function.
   *
   * The listeners run in the bubble phase, after the handlers that saw the
   * event; a handler that stops `pointerup` propagation, or claims during it,
   * must release its own claim.
   */
  attach(target?: PointerOwnershipTarget): () => void;
}

interface Attachment {
  count: number;
  remove: () => void;
}

/** Make an isolated registry. Most apps want the shared {@link pointerOwnership} instead. */
export function createPointerOwnership(): PointerOwnership {
  const owners = new Map<number, string>();
  const listeners = new Set<PointerReleaseListener>();
  const attachments = new Map<PointerOwnershipTarget, Attachment>();

  const notify = (released: ReadonlyArray<readonly [number, string]>) => {
    for (const [pointerId, owner] of released) {
      // A snapshot, so a listener added mid-release waits for the next one; and a listener
      // removed mid-release is skipped, so nothing is called after it unsubscribed.
      for (const listener of [...listeners]) {
        if (listeners.has(listener)) listener(pointerId, owner);
      }
    }
  };

  const release = (pointerId: number, owner?: string) => {
    const current = owners.get(pointerId);
    if (current === undefined || (owner !== undefined && current !== owner)) return false;
    owners.delete(pointerId);
    notify([[pointerId, current]]);
    return true;
  };

  const clear = () => {
    const released = [...owners];
    owners.clear();
    notify(released);
  };

  const attach = (target: PointerOwnershipTarget = window) => {
    let attachment = attachments.get(target);
    if (!attachment) {
      const onEnd = (event: Event) => release((event as PointerEvent).pointerId);
      target.addEventListener("pointerup", onEnd);
      target.addEventListener("pointercancel", onEnd);
      target.addEventListener("blur", clear);
      attachment = {
        count: 0,
        remove: () => {
          target.removeEventListener("pointerup", onEnd);
          target.removeEventListener("pointercancel", onEnd);
          target.removeEventListener("blur", clear);
        },
      };
      attachments.set(target, attachment);
    }
    const held = attachment;
    held.count += 1;
    let attached = true;
    return () => {
      if (!attached) return;
      attached = false;
      held.count -= 1;
      if (held.count === 0) {
        held.remove();
        attachments.delete(target);
      }
    };
  };

  return {
    claim(pointerId, owner) {
      const current = owners.get(pointerId);
      if (current !== undefined) return current === owner;
      owners.set(pointerId, owner);
      return true;
    },
    release,
    releaseAll(owner) {
      const mine = [...owners].filter(([, current]) => current === owner);
      for (const [pointerId] of mine) owners.delete(pointerId);
      notify(mine);
      return mine.length;
    },
    ownerOf: (pointerId) => owners.get(pointerId),
    clear,
    onRelease(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    attach,
  };
}

/**
 * The shared registry. `FloatingJoystick` and `usePointerOwnership` use it by
 * default, so a joystick and your own subsystems arbitrate with no wiring.
 */
export const pointerOwnership: PointerOwnership = createPointerOwnership();
