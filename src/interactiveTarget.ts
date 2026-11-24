/**
 * Which pointer targets belong to the page's own UI, not to a gesture controller. Look, tap and
 * camera input all leave a press on one of these alone, so a button inside the game viewport stays
 * a button. `FloatingJoystick` keeps its own, narrower list (it does not exclude editable content).
 */
// Controls a press may legitimately start on when the caller says so: they act on release (a click)
// and have nothing to select or type into.
const pressable = "button,a,summary,[role='button']";
// Never a gesture's: text entry and editing, and anything the page marked off-limits.
const reserved =
  "input,textarea,select,[contenteditable]:not([contenteditable='false']),[data-joystick-ignore]";

export interface InteractiveTargetOptions {
  /**
   * Treat `button`, `a`, `summary` and `[role="button"]` as not interactive, so a press on one can
   * start a gesture. Inputs, selects, textareas, editable content and `data-joystick-ignore`
   * subtrees stay interactive. Default `false`.
   */
  allowControls?: boolean;
}

/** Whether `target`, or an ancestor, is a control, link, editable region or `data-joystick-ignore` subtree. */
export function isInteractiveTarget(
  target: EventTarget | null,
  { allowControls = false }: InteractiveTargetOptions = {}
): boolean {
  const element = target as Element | null;
  if (element?.closest?.(reserved) != null) return true;
  return !allowControls && element?.closest?.(pressable) != null;
}
