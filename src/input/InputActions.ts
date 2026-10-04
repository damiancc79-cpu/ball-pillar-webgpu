/**
 * Semantic controls understood by the game.  Keeping gameplay code on these
 * names (instead of physical keys) makes keyboard, mouse and gamepad input
 * interchangeable.
 */
export const INPUT_ACTIONS = [
  "moveForward",
  "moveBackward",
  "moveLeft",
  "moveRight",
  "brake",
  "boost",
  "jump",
  "cameraLeft",
  "cameraRight",
  "cameraUp",
  "cameraDown",
  "cameraRecenter",
  "resetCheckpoint",
  "pause",
  "confirm",
  "cancel",
  "menuUp",
  "menuDown",
  "menuLeft",
  "menuRight"
] as const;

export type InputAction = (typeof INPUT_ACTIONS)[number];

export type InputDevice = "keyboard" | "mouse" | "gamepad";

export type KeyboardBindingMap = Readonly<Record<InputAction, readonly string[]>>;

/** Browser `KeyboardEvent.code` bindings rather than layout-dependent keys. */
export const DEFAULT_KEYBOARD_BINDINGS: KeyboardBindingMap = {
  moveForward: ["KeyW", "ArrowUp"],
  moveBackward: ["KeyS", "ArrowDown"],
  moveLeft: ["KeyA", "ArrowLeft"],
  moveRight: ["KeyD", "ArrowRight"],
  brake: ["KeyX"],
  boost: ["ShiftLeft", "ShiftRight"],
  jump: ["Space"],
  cameraLeft: ["KeyQ"],
  cameraRight: ["KeyE"],
  cameraUp: ["PageUp"],
  cameraDown: ["PageDown"],
  cameraRecenter: ["KeyC"],
  resetCheckpoint: ["KeyR"],
  pause: ["Escape"],
  confirm: ["Enter"],
  cancel: ["Escape", "Backspace"],
  menuUp: ["ArrowUp", "KeyW"],
  menuDown: ["ArrowDown", "KeyS"],
  menuLeft: ["ArrowLeft", "KeyA"],
  menuRight: ["ArrowRight", "KeyD"]
};

/** Standard Gamepad mapping indices used by Chrome, Firefox and Safari. */
export const GAMEPAD_BUTTONS = {
  south: 0,
  east: 1,
  leftShoulder: 4,
  rightShoulder: 5,
  leftTrigger: 6,
  rightTrigger: 7,
  view: 8,
  menu: 9,
  leftStick: 10,
  rightStick: 11,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15
} as const;

export const DEFAULT_GAMEPAD_BUTTON_BINDINGS: Readonly<Partial<Record<InputAction, readonly number[]>>> = {
  brake: [GAMEPAD_BUTTONS.leftTrigger],
  boost: [GAMEPAD_BUTTONS.rightTrigger],
  jump: [GAMEPAD_BUTTONS.south],
  cameraRecenter: [GAMEPAD_BUTTONS.rightStick],
  resetCheckpoint: [GAMEPAD_BUTTONS.view],
  pause: [GAMEPAD_BUTTONS.menu],
  confirm: [GAMEPAD_BUTTONS.south],
  cancel: [GAMEPAD_BUTTONS.east],
  menuUp: [GAMEPAD_BUTTONS.dpadUp],
  menuDown: [GAMEPAD_BUTTONS.dpadDown],
  menuLeft: [GAMEPAD_BUTTONS.dpadLeft],
  menuRight: [GAMEPAD_BUTTONS.dpadRight]
};

export interface InputVector {
  x: number;
  y: number;
}

export const ZERO_INPUT_VECTOR: Readonly<InputVector> = Object.freeze({ x: 0, y: 0 });

export function clampInput(value: number): number {
  return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
}

/** Removes a radial stick dead zone while preserving the remaining range. */
export function applyRadialDeadZone(x: number, y: number, deadZone = 0.16): InputVector {
  const safeDeadZone = Math.max(0, Math.min(0.95, deadZone));
  const magnitude = Math.hypot(x, y);

  if (magnitude <= safeDeadZone || magnitude === 0) {
    return { x: 0, y: 0 };
  }

  const remappedMagnitude = Math.min(1, (magnitude - safeDeadZone) / (1 - safeDeadZone));
  return {
    x: clampInput((x / magnitude) * remappedMagnitude),
    y: clampInput((y / magnitude) * remappedMagnitude)
  };
}

export function mergeKeyboardBindings(
  overrides: Partial<Record<InputAction, readonly string[]>> = {}
): KeyboardBindingMap {
  const merged = {} as Record<InputAction, readonly string[]>;
  for (const action of INPUT_ACTIONS) {
    merged[action] = overrides[action] ?? DEFAULT_KEYBOARD_BINDINGS[action];
  }
  return merged;
}
