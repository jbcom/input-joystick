import { cleanup, render, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, expect, test } from "vitest";
import { FloatingJoystick, type JoystickVector } from "../src/index";

afterEach(() => {
  cleanup();
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
