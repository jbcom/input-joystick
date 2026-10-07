export interface JoystickVector {
  x: number;
  y: number;
  magnitude: number;
  angle: number;
}

export interface RawOffset {
  x: number;
  y: number;
}

/**
 * Pure deadzone/clamp/normalize math for a floating joystick.
 *
 * Given a raw pointer offset (in px, relative to the joystick's origin),
 * the joystick's travel radius, and a deadzone fraction (0-1 of radius),
 * returns the normalized [-1..1] vector plus magnitude/angle that should
 * drive movement.
 *
 * Offsets inside the deadzone report zero magnitude (no drift from thumb
 * wobble). Offsets beyond `radius` clamp to a unit-length vector. Between
 * the deadzone and the radius, magnitude scales linearly from 0 to 1.
 *
 * Kept separate from the component so the deadzone/clamp curve is
 * unit-testable without simulating DOM pointer events; FloatingJoystick calls
 * it for every vector it emits.
 */
export function normalizeJoystick(
  raw: RawOffset,
  radius: number,
  deadZone: number
): JoystickVector {
  const distance = Math.hypot(raw.x, raw.y);
  const clampedDistance = Math.min(radius, distance);
  const unitX = distance > 0 ? raw.x / distance : 0;
  const unitY = distance > 0 ? raw.y / distance : 0;
  const rawMagnitude = radius > 0 ? clampedDistance / radius : 0;
  const magnitudeBase =
    rawMagnitude <= deadZone ? 0 : (rawMagnitude - deadZone) / Math.max(0.01, 1 - deadZone);
  const magnitude = Math.min(1, magnitudeBase);

  return {
    x: unitX * magnitude,
    y: unitY * magnitude,
    magnitude,
    angle: Math.atan2(unitY, unitX),
  };
}
