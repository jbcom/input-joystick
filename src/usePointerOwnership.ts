import { useEffect, useMemo } from "react";
import { type PointerOwnership, pointerOwnership } from "./pointerOwnership.js";

export interface UsePointerOwnershipOptions {
  /** The registry to arbitrate in. Defaults to the shared {@link pointerOwnership}. */
  ownership?: PointerOwnership;
}

/** A registry seen from one owner: every call is already made on that owner's behalf. */
export interface OwnedPointers {
  /** Take a pointer. `false` when another owner holds it; `true` when it is free or already yours. */
  claim(pointerId: number): boolean;
  /** Give back a pointer you hold. A pointer another owner holds is left alone. */
  release(pointerId: number): boolean;
  /** Whether you hold this pointer. */
  owns(pointerId: number): boolean;
  /** Whether a different owner holds this pointer, which is the question a look or drag handler asks. */
  heldByOther(pointerId: number): boolean;
  /** Who holds the pointer, or `undefined` when it is free. */
  ownerOf(pointerId: number): string | undefined;
}

/**
 * Arbitrate pointers as `owner`. While the component is mounted the registry
 * releases claims when a pointer ends, is cancelled or the window loses
 * focus; on unmount every pointer this owner still holds is released.
 *
 * The returned object is stable for a given `owner` and registry, so it is safe
 * in dependency arrays and event handlers.
 */
export function usePointerOwnership(
  owner: string,
  { ownership = pointerOwnership }: UsePointerOwnershipOptions = {}
): OwnedPointers {
  useEffect(() => {
    const detach = ownership.attach();
    return () => {
      detach();
      ownership.releaseAll(owner);
    };
  }, [ownership, owner]);

  return useMemo<OwnedPointers>(
    () => ({
      claim: (pointerId) => ownership.claim(pointerId, owner),
      release: (pointerId) => ownership.release(pointerId, owner),
      owns: (pointerId) => ownership.ownerOf(pointerId) === owner,
      heldByOther: (pointerId) => {
        const holder = ownership.ownerOf(pointerId);
        return holder !== undefined && holder !== owner;
      },
      ownerOf: (pointerId) => ownership.ownerOf(pointerId),
    }),
    [ownership, owner]
  );
}
