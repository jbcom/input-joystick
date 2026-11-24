/**
 * Which pointer targets belong to the page's own UI, not to a gesture controller. Look, tap and
 * camera input all leave a press on one of these alone, so a button inside the game viewport stays
 * a button. `FloatingJoystick` keeps its own, narrower list (it does not exclude editable content).
 */
const interactive =
  "button,a,input,textarea,select,summary,[role='button'],[contenteditable]:not([contenteditable='false']),[data-joystick-ignore]";

/** Whether `target`, or an ancestor, is a control, link, editable region or `data-joystick-ignore` subtree. */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  return (target as Element | null)?.closest?.(interactive) != null;
}
