import { cleanup, render, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, expect, test } from "vitest";
import {
  type ClaimRect,
  claimWidthFraction,
  createPointerOwnership,
  FloatingJoystick,
  type JoystickVector,
  pointerOwnership,
} from "../src/index";

afterEach(() => {
  cleanup();
  pointerOwnership.clear();
});

test("FloatingJoystick opens at the pointer origin and emits normalized movement", async () => {
  const vectors: JoystickVector[] = [];
  const { getByTestId } = render(
    <div data-testid="game-viewport" style={{ width: 320, height: 320 }}>
      <FloatingJoystick allowMouse onChange={(vector) => vectors.push(vector)} />
    </div>
  );

  const host = getByTestId("game-viewport");
  await new Promise((resolve) => requestAnimationFrame(resolve));
  host.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      clientX: 120,
      clientY: 120,
      isPrimary: true,
      pointerId: 11,
      pointerType: "mouse",
    })
  );
  window.dispatchEvent(
    new PointerEvent("pointermove", {
      clientX: 178,
      clientY: 120,
      isPrimary: true,
      pointerId: 11,
      pointerType: "mouse",
    })
  );

  await waitFor(() => {
    expect(document.querySelector('[data-testid="floating-joystick"]')).not.toBeNull();
    expect(vectors.at(-1)?.x).toBeGreaterThan(0.9);
    expect(Math.abs(vectors.at(-1)?.y ?? 1)).toBeLessThan(0.01);
  });

  window.dispatchEvent(
    new PointerEvent("pointerup", {
      clientX: 178,
      clientY: 120,
      isPrimary: true,
      pointerId: 11,
      pointerType: "mouse",
    })
  );

  await waitFor(() => {
    expect(vectors.at(-1)).toEqual({ x: 0, y: 0, magnitude: 0, angle: 0 });
  });
});

test("FloatingJoystick can claim a non-primary touch pointer for multi-touch controls", async () => {
  const vectors: JoystickVector[] = [];
  const { getByTestId } = render(
    <div data-testid="game-viewport" style={{ width: 320, height: 320 }}>
      <FloatingJoystick onChange={(vector) => vectors.push(vector)} />
    </div>
  );

  const host = getByTestId("game-viewport");
  await new Promise((resolve) => requestAnimationFrame(resolve));
  host.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      clientX: 80,
      clientY: 140,
      isPrimary: false,
      pointerId: 22,
      pointerType: "touch",
    })
  );
  window.dispatchEvent(
    new PointerEvent("pointermove", {
      clientX: 80,
      clientY: 82,
      isPrimary: false,
      pointerId: 22,
      pointerType: "touch",
    })
  );

  await waitFor(() => {
    expect(document.querySelector('[data-testid="floating-joystick"]')).not.toBeNull();
    expect(vectors.at(-1)?.y).toBeLessThan(-0.9);
  });
});

const ZERO: JoystickVector = { x: 0, y: 0, magnitude: 0, angle: 0 };

function pointer(
  type: string,
  init: { x: number; y: number; id: number; kind?: string; cancelable?: boolean }
) {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: init.cancelable ?? true,
    clientX: init.x,
    clientY: init.y,
    isPrimary: true,
    pointerId: init.id,
    pointerType: init.kind ?? "touch",
  });
}

function mount(
  props: Partial<ComponentProps<typeof FloatingJoystick>> = {},
  children: ReactNode = null
) {
  const vectors: JoystickVector[] = [];
  const view = render(
    <div data-testid="game-viewport" style={{ width: 320, height: 320 }}>
      {children}
      <FloatingJoystick onChange={(vector) => vectors.push(vector)} {...props} />
    </div>
  );
  return { ...view, vectors, host: view.getByTestId("game-viewport") };
}

const ring = () => document.querySelector('[data-testid="floating-joystick"]');

test("a mouse is ignored unless allowMouse is set", () => {
  const { host } = mount();
  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1, kind: "mouse" }));
  expect(ring()).toBeNull();
});

test("while one pointer is claimed, other pointers neither start nor move the stick", async () => {
  const { host, vectors } = mount();
  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  await waitFor(() => expect(ring()).not.toBeNull());

  host.dispatchEvent(pointer("pointerdown", { x: 250, y: 250, id: 2 }));
  window.dispatchEvent(pointer("pointermove", { x: 250, y: 100, id: 2 }));
  window.dispatchEvent(pointer("pointerup", { x: 250, y: 100, id: 2 }));

  expect(vectors.every((vector) => vector.magnitude === 0)).toBe(true);
  expect(ring()).not.toBeNull();
});

test("pointercancel ends the gesture with a zero vector", async () => {
  const { host, vectors } = mount();
  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  window.dispatchEvent(pointer("pointermove", { x: 150, y: 100, id: 1 }));
  await waitFor(() => expect(vectors.at(-1)?.magnitude).toBeGreaterThan(0));

  window.dispatchEvent(pointer("pointercancel", { x: 150, y: 100, id: 1 }));
  await waitFor(() => expect(ring()).toBeNull());
  expect(vectors.at(-1)).toEqual(ZERO);
});

test("a pointerdown on a control or a data-joystick-ignore element does not start the stick", () => {
  const { getByText } = mount(
    {},
    <>
      <button type="button">Fire</button>
      <div data-joystick-ignore="true">Menu</div>
    </>
  );
  getByText("Fire").dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  getByText("Menu").dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 2 }));
  expect(ring()).toBeNull();
});

test("a pointerdown outside the host element or its rectangle does not start the stick", () => {
  const { host } = mount();
  document.body.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  host.dispatchEvent(pointer("pointerdown", { x: 5000, y: 5000, id: 2 }));
  expect(ring()).toBeNull();
});

test("a pointerdown whose target is the window itself is not treated as an interactive control", async () => {
  mount();
  window.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  await waitFor(() => expect(ring()).not.toBeNull());
});

test("without a matching host the parent element is the host", async () => {
  const vectors: JoystickVector[] = [];
  const { container } = render(
    <div style={{ width: 200, height: 200 }}>
      <FloatingJoystick hostSelector="#absent" onChange={(vector) => vectors.push(vector)} />
    </div>
  );
  const parent = container.firstElementChild as HTMLElement;
  parent.dispatchEvent(pointer("pointerdown", { x: 50, y: 50, id: 1 }));
  await waitFor(() => expect(ring()).not.toBeNull());
});

test("a custom hostSelector scopes the hit-test host", async () => {
  const { getByTestId } = render(
    <div id="playfield" data-testid="playfield" style={{ width: 200, height: 200 }}>
      <FloatingJoystick hostSelector="#playfield" onChange={() => undefined} />
    </div>
  );
  getByTestId("playfield").dispatchEvent(pointer("pointerdown", { x: 50, y: 50, id: 1 }));
  await waitFor(() => expect(ring()).not.toBeNull());
});

test("disabled reports a zero vector, ignores touches and re-enables", async () => {
  const vectors: JoystickVector[] = [];
  const onChange = (vector: JoystickVector) => vectors.push(vector);
  const view = render(
    <div data-testid="game-viewport" style={{ width: 320, height: 320 }}>
      <FloatingJoystick disabled onChange={onChange} />
    </div>
  );
  const host = view.getByTestId("game-viewport");
  expect(vectors.at(-1)).toEqual(ZERO);

  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  expect(ring()).toBeNull();

  view.rerender(
    <div data-testid="game-viewport" style={{ width: 320, height: 320 }}>
      <FloatingJoystick onChange={onChange} />
    </div>
  );
  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 2 }));
  await waitFor(() => expect(ring()).not.toBeNull());
});

test("unmounting while a pointer is held reports a zero vector", async () => {
  const { host, vectors, unmount } = mount();
  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  window.dispatchEvent(pointer("pointermove", { x: 150, y: 100, id: 1 }));
  await waitFor(() => expect(vectors.at(-1)?.magnitude).toBeGreaterThan(0));

  unmount();
  expect(vectors.at(-1)).toEqual(ZERO);
});

test("the ring carries the label, radius and accent, and non-cancelable events are tolerated", async () => {
  const { host } = mount({ label: "Steer", radius: 40, accent: "#ff8800" });
  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1, cancelable: false }));
  window.dispatchEvent(pointer("pointermove", { x: 120, y: 100, id: 1, cancelable: false }));
  await waitFor(() => expect(ring()).not.toBeNull());

  const element = ring() as HTMLElement;
  expect(element.title).toBe("Steer");
  expect(element.style.width).toBe("80px");
  expect(element.getAttribute("style")).toContain("rgba(255, 136, 0");
});

test("a cancelable pointerdown is default-prevented so the page does not scroll", () => {
  const { host } = mount();
  const down = pointer("pointerdown", { x: 100, y: 100, id: 1 });
  host.dispatchEvent(down);
  expect(down.defaultPrevented).toBe(true);
});

test("a joystick rendered into a detached fragment has no host, so any pointer inside the page starts it", async () => {
  const fragment = document.createDocumentFragment();
  const view = render(<FloatingJoystick onChange={() => undefined} />, {
    container: fragment,
    baseElement: document.body,
  });
  const wrapper = fragment.querySelector("[data-floating-joystick]") as HTMLElement;
  expect(wrapper.parentElement).toBeNull();

  window.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  await waitFor(() =>
    expect(wrapper.querySelector('[data-testid="floating-joystick"]')).not.toBeNull()
  );
  view.unmount();
});

// --- claim area -------------------------------------------------------------------------------

test("a claimArea decides which presses the stick takes; the rest are left alone", async () => {
  const registry = createPointerOwnership();
  const { host, vectors } = mount({
    claimArea: claimWidthFraction("left", 0.4),
    ownership: registry,
  });

  // Host is 320 wide: the left 40% is x < 128.
  const right = pointer("pointerdown", { x: 200, y: 100, id: 1 });
  host.dispatchEvent(right);
  expect(ring()).toBeNull();
  expect(registry.ownerOf(1)).toBeUndefined();
  expect(right.defaultPrevented).toBe(false);
  window.dispatchEvent(pointer("pointermove", { x: 260, y: 100, id: 1 }));
  expect(vectors.every((vector) => vector.magnitude === 0)).toBe(true);

  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 2 }));
  await waitFor(() => expect(ring()).not.toBeNull());
  expect(registry.ownerOf(2)).toBe("joystick");
});

test("the claimArea receives the press and the host's rectangle", () => {
  const seen: Array<{ x: number; rect: ClaimRect }> = [];
  const { host } = mount({
    claimArea: (event, rect) => {
      seen.push({ x: event.clientX, rect });
      return true;
    },
  });
  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  expect(seen).toHaveLength(1);
  expect(seen[0]?.x).toBe(100);
  expect(seen[0]?.rect.width).toBe(320);
  expect(seen[0]?.rect.height).toBe(320);
});

test("a claimArea is only asked about presses already inside the host and on non-controls", () => {
  const asked: number[] = [];
  const { host, getByText } = mount(
    { claimArea: (event) => asked.push(event.pointerId) > 0 },
    <button type="button">Fire</button>
  );
  host.dispatchEvent(pointer("pointerdown", { x: 5000, y: 5000, id: 1 }));
  expect(asked).toEqual([]);
  getByText("Fire").dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 2 }));
  expect(asked).toEqual([]);

  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 3 }));
  expect(asked).toEqual([3]);
});

test("a new claimArea function identity does not release a held pointer", async () => {
  const vectors: JoystickVector[] = [];
  const onChange = (vector: JoystickVector) => vectors.push(vector);
  const tree = (claimArea: () => boolean) => (
    <div data-testid="game-viewport" style={{ width: 320, height: 320 }}>
      <FloatingJoystick onChange={onChange} claimArea={claimArea} />
    </div>
  );
  const view = render(tree(() => true));
  view
    .getByTestId("game-viewport")
    .dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  await waitFor(() => expect(ring()).not.toBeNull());
  const callsBefore = vectors.length;

  view.rerender(tree(() => false));
  window.dispatchEvent(pointer("pointermove", { x: 150, y: 100, id: 1 }));
  await waitFor(() => expect(vectors.at(-1)?.magnitude).toBeGreaterThan(0));
  expect(vectors.slice(callsBefore).every((vector) => vector.magnitude > 0)).toBe(true);

  // The new function decides the next press, though.
  window.dispatchEvent(pointer("pointerup", { x: 150, y: 100, id: 1 }));
  await waitFor(() => expect(ring()).toBeNull());
  view
    .getByTestId("game-viewport")
    .dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 2 }));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  expect(ring()).toBeNull();
  expect(pointerOwnership.ownerOf(2)).toBeUndefined();
});

// --- pointer ownership ------------------------------------------------------------------------

test("the stick claims its pointer as 'joystick' in the shared registry by default", async () => {
  const { host } = mount();
  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  await waitFor(() => expect(ring()).not.toBeNull());
  expect(pointerOwnership.ownerOf(1)).toBe("joystick");
});

test("a custom owner name and registry are used for the claim", async () => {
  const registry = createPointerOwnership();
  const { host } = mount({ owner: "move-stick", ownership: registry });
  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  await waitFor(() => expect(ring()).not.toBeNull());
  expect(registry.ownerOf(1)).toBe("move-stick");
  expect(pointerOwnership.ownerOf(1)).toBeUndefined();
});

test("a pointer another owner already holds is never taken by the stick", () => {
  const registry = createPointerOwnership();
  const { host, vectors } = mount({ ownership: registry });
  // A station's own handler sees the press first and claims it.
  host.addEventListener("pointerdown", (event) => {
    registry.claim((event as PointerEvent).pointerId, "station");
  });

  const down = pointer("pointerdown", { x: 100, y: 100, id: 1 });
  host.dispatchEvent(down);
  window.dispatchEvent(pointer("pointermove", { x: 150, y: 100, id: 1 }));

  expect(ring()).toBeNull();
  expect(down.defaultPrevented).toBe(false);
  expect(vectors.every((vector) => vector.magnitude === 0)).toBe(true);
  expect(registry.ownerOf(1)).toBe("station");
});

test("a pointer the stick holds is refused to everyone else", async () => {
  const registry = createPointerOwnership();
  const { host } = mount({ ownership: registry });
  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  await waitFor(() => expect(ring()).not.toBeNull());

  expect(registry.claim(1, "station")).toBe(false);
  expect(registry.release(1, "station")).toBe(false);
  expect(registry.ownerOf(1)).toBe("joystick");
});

test("two fingers: the stick keeps its own, a station keeps the other, neither crosses over", async () => {
  const registry = createPointerOwnership();
  const { host, vectors } = mount({ ownership: registry });

  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  await waitFor(() => expect(ring()).not.toBeNull());
  // A second finger lands on a station, which claims it before the window sees it.
  expect(registry.claim(2, "station")).toBe(true);
  host.dispatchEvent(pointer("pointerdown", { x: 250, y: 250, id: 2 }));

  // The station finger drags: the stick does not steer from it.
  window.dispatchEvent(pointer("pointermove", { x: 250, y: 100, id: 2 }));
  expect(vectors.every((vector) => vector.magnitude === 0)).toBe(true);

  // The stick finger drags: the stick steers from it.
  window.dispatchEvent(pointer("pointermove", { x: 160, y: 100, id: 1 }));
  await waitFor(() => expect(vectors.at(-1)?.x).toBeGreaterThan(0.9));
  expect(registry.ownerOf(1)).toBe("joystick");
  expect(registry.ownerOf(2)).toBe("station");

  // The station finger lifts: its claim goes, the stick's is untouched and still steering.
  window.dispatchEvent(pointer("pointerup", { x: 250, y: 100, id: 2 }));
  expect(registry.ownerOf(2)).toBeUndefined();
  expect(registry.ownerOf(1)).toBe("joystick");
  expect(ring()).not.toBeNull();
  expect(vectors.at(-1)?.magnitude).toBeGreaterThan(0);
});

test("once the owner lets go, the same pointer id can start the stick", async () => {
  const registry = createPointerOwnership();
  const { host } = mount({ ownership: registry });
  registry.claim(1, "station");
  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  expect(ring()).toBeNull();

  window.dispatchEvent(pointer("pointerup", { x: 100, y: 100, id: 1 }));
  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  await waitFor(() => expect(ring()).not.toBeNull());
  expect(registry.ownerOf(1)).toBe("joystick");
});

test("pointerup releases the stick's claim and zeroes the vector", async () => {
  const registry = createPointerOwnership();
  const { host, vectors } = mount({ ownership: registry });
  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  window.dispatchEvent(pointer("pointermove", { x: 150, y: 100, id: 1 }));
  await waitFor(() => expect(vectors.at(-1)?.magnitude).toBeGreaterThan(0));

  window.dispatchEvent(pointer("pointerup", { x: 150, y: 100, id: 1 }));
  await waitFor(() => expect(ring()).toBeNull());
  expect(registry.ownerOf(1)).toBeUndefined();
  expect(vectors.at(-1)).toEqual(ZERO);
});

test("pointercancel releases the stick's claim and zeroes the vector", async () => {
  const registry = createPointerOwnership();
  const { host, vectors } = mount({ ownership: registry });
  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  window.dispatchEvent(pointer("pointermove", { x: 150, y: 100, id: 1 }));
  await waitFor(() => expect(vectors.at(-1)?.magnitude).toBeGreaterThan(0));

  window.dispatchEvent(pointer("pointercancel", { x: 150, y: 100, id: 1 }));
  await waitFor(() => expect(ring()).toBeNull());
  expect(registry.ownerOf(1)).toBeUndefined();
  expect(vectors.at(-1)).toEqual(ZERO);
});

test("a pointercancel on a station's pointer leaves the stick's claim alone", async () => {
  const registry = createPointerOwnership();
  const { host, vectors } = mount({ ownership: registry });
  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  await waitFor(() => expect(ring()).not.toBeNull());
  registry.claim(2, "station");

  window.dispatchEvent(pointer("pointercancel", { x: 250, y: 250, id: 2 }));
  expect(registry.ownerOf(2)).toBeUndefined();
  expect(registry.ownerOf(1)).toBe("joystick");
  expect(ring()).not.toBeNull();
  expect(vectors.at(-1)?.magnitude).toBe(0);
});

test("a claim released from the registry ends the gesture, as when the window loses focus", async () => {
  const registry = createPointerOwnership();
  const { host, vectors } = mount({ ownership: registry });
  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  window.dispatchEvent(pointer("pointermove", { x: 150, y: 100, id: 1 }));
  await waitFor(() => expect(vectors.at(-1)?.magnitude).toBeGreaterThan(0));

  window.dispatchEvent(new Event("blur"));
  await waitFor(() => expect(ring()).toBeNull());
  expect(registry.ownerOf(1)).toBeUndefined();
  expect(vectors.at(-1)).toEqual(ZERO);

  // The pointer it let go of no longer steers it.
  window.dispatchEvent(pointer("pointermove", { x: 200, y: 100, id: 1 }));
  expect(vectors.at(-1)).toEqual(ZERO);
  expect(ring()).toBeNull();
});

test("another owner's release of its own pointer does not end the stick's gesture", async () => {
  const registry = createPointerOwnership();
  const { host } = mount({ ownership: registry });
  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  await waitFor(() => expect(ring()).not.toBeNull());

  registry.claim(2, "station");
  registry.release(2, "station");
  expect(ring()).not.toBeNull();
});

test("unmounting releases the stick's claim and stops listening to the registry", async () => {
  const registry = createPointerOwnership();
  const { host, vectors, unmount } = mount({ ownership: registry });
  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  await waitFor(() => expect(ring()).not.toBeNull());

  unmount();
  expect(registry.ownerOf(1)).toBeUndefined();
  expect(vectors.at(-1)).toEqual(ZERO);

  // Nothing of the stick is attached any more: a claim made now is released by nobody.
  registry.claim(3, "station");
  window.dispatchEvent(pointer("pointerup", { x: 0, y: 0, id: 3 }));
  expect(registry.ownerOf(3)).toBe("station");
});

test("disabling releases the held claim", async () => {
  const registry = createPointerOwnership();
  const vectors: JoystickVector[] = [];
  const tree = (disabled: boolean) => (
    <div data-testid="game-viewport" style={{ width: 320, height: 320 }}>
      <FloatingJoystick
        disabled={disabled}
        ownership={registry}
        onChange={(vector) => vectors.push(vector)}
      />
    </div>
  );
  const view = render(tree(false));
  view
    .getByTestId("game-viewport")
    .dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  await waitFor(() => expect(ring()).not.toBeNull());
  expect(registry.ownerOf(1)).toBe("joystick");

  view.rerender(tree(true));
  expect(registry.ownerOf(1)).toBeUndefined();
  expect(vectors.at(-1)).toEqual(ZERO);
});

test("a press on a control or outside the host never holds a claim", () => {
  const registry = createPointerOwnership();
  const { host, getByText } = mount({ ownership: registry }, <button type="button">Fire</button>);
  getByText("Fire").dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  host.dispatchEvent(pointer("pointerdown", { x: 5000, y: 5000, id: 2 }));
  expect(registry.ownerOf(1)).toBeUndefined();
  expect(registry.ownerOf(2)).toBeUndefined();
});

test("the stick gives its claim back on pointerup even when the registry does not listen itself", async () => {
  const inner = createPointerOwnership();
  const registry = { ...inner, attach: () => () => undefined };
  const { host, vectors } = mount({ ownership: registry });
  host.dispatchEvent(pointer("pointerdown", { x: 100, y: 100, id: 1 }));
  window.dispatchEvent(pointer("pointermove", { x: 150, y: 100, id: 1 }));
  await waitFor(() => expect(vectors.at(-1)?.magnitude).toBeGreaterThan(0));
  expect(inner.ownerOf(1)).toBe("joystick");

  window.dispatchEvent(pointer("pointerup", { x: 150, y: 100, id: 1 }));
  expect(inner.ownerOf(1)).toBeUndefined();
  await waitFor(() => expect(ring()).toBeNull());
});
