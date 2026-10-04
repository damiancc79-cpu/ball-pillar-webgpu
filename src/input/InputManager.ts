import {
  DEFAULT_GAMEPAD_BUTTON_BINDINGS,
  DEFAULT_KEYBOARD_BINDINGS,
  INPUT_ACTIONS,
  clampInput,
  mergeKeyboardBindings,
  type InputAction,
  type InputDevice,
  type InputVector,
  type KeyboardBindingMap
} from "./InputActions";
import { GamepadInput, type GamepadInputOptions } from "./GamepadInput";
import { KeyboardInput, type KeyboardInputOptions } from "./KeyboardInput";

export type InputAxis = "moveX" | "moveY" | "cameraX" | "cameraY";

export interface InputManagerOptions {
  keyboard?: KeyboardInput;
  gamepad?: GamepadInput;
  keyboardOptions?: KeyboardInputOptions;
  gamepadOptions?: GamepadInputOptions;
  keyboardBindings?: Partial<Record<InputAction, readonly string[]>>;
  gamepadButtonBindings?: Partial<Record<InputAction, readonly number[]>>;
  pointerTarget?: EventTarget;
  mouseSensitivity?: number;
  invertMouseY?: boolean;
  invertGamepadY?: boolean;
}

export interface InputActionState {
  down: boolean;
  pressed: boolean;
  released: boolean;
  device: InputDevice | null;
}

export interface InputManagerSnapshot {
  device: InputDevice;
  axes: Readonly<Record<InputAxis, number>>;
  actions: Readonly<Record<InputAction, InputActionState>>;
}

export interface InputCameraSettings {
  mouseSensitivity?: number;
  invertMouseY?: boolean;
  invertGamepadY?: boolean;
  gamepadDeadZone?: number;
}

type MutableActionState = InputActionState;

function makeActionState(): MutableActionState {
  return { down: false, pressed: false, released: false, device: null };
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.tagName === "BUTTON"
  );
}

/**
 * Combines keyboard/mouse and gamepad state behind stable action names.  The
 * game loop calls `update()` once per animation frame, then reads values until
 * the next call.  UI code can use the same instance without knowing the device.
 */
export class InputManager {
  public readonly keyboard: KeyboardInput;
  public readonly gamepad: GamepadInput;

  private readonly keyboardBindings: KeyboardBindingMap;
  private readonly gamepadBindings: Readonly<Partial<Record<InputAction, readonly number[]>>>;
  private readonly actionStates = {} as Record<InputAction, MutableActionState>;
  private readonly axisValues: Record<InputAxis, number> = {
    moveX: 0,
    moveY: 0,
    cameraX: 0,
    cameraY: 0
  };
  private readonly pointerTarget?: EventTarget;
  private readonly mouseMoveBound = (event: Event): void => {
    this.handlePointerMove(event as PointerEvent | MouseEvent);
  };
  private _activeDevice: InputDevice = "keyboard";
  private _mouseSensitivity: number;
  private mouseX = 0;
  private mouseY = 0;
  private frameMouseX = 0;
  private frameMouseY = 0;
  private invertMouseY: boolean;
  private invertGamepadY: boolean;
  private connected = false;
  private enabled = true;

  public constructor(options: InputManagerOptions = {}) {
    const defaultTarget = typeof window !== "undefined" ? window : undefined;
    this.keyboard =
      options.keyboard ??
      new KeyboardInput({
        ...options.keyboardOptions,
        target: options.keyboardOptions?.target ?? defaultTarget
      });
    this.gamepad = options.gamepad ?? new GamepadInput(options.gamepadOptions);
    this.keyboardBindings = mergeKeyboardBindings(options.keyboardBindings);
    this.gamepadBindings = { ...DEFAULT_GAMEPAD_BUTTON_BINDINGS, ...options.gamepadButtonBindings };
    this.pointerTarget = options.pointerTarget ?? defaultTarget;
    this._mouseSensitivity = Math.max(0.0001, options.mouseSensitivity ?? 0.012);
    this.invertMouseY = options.invertMouseY ?? false;
    this.invertGamepadY = options.invertGamepadY ?? false;

    for (const action of INPUT_ACTIONS) {
      this.actionStates[action] = makeActionState();
    }

    // The default browser instance should be usable immediately; `connect()`
    // remains idempotent for embedders that manage lifecycle explicitly.
    this.connect();
  }

  public get activeDevice(): InputDevice {
    return this._activeDevice;
  }

  public get mouseSensitivity(): number {
    return this._mouseSensitivity;
  }

  public set mouseSensitivity(value: number) {
    this._mouseSensitivity = Math.max(0.0001, Number.isFinite(value) ? value : 0.012);
  }

  public get isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  setCameraSettings(settings: InputCameraSettings): void {
    if (typeof settings.mouseSensitivity === "number") this.mouseSensitivity = settings.mouseSensitivity;
    if (typeof settings.invertMouseY === "boolean") this.invertMouseY = settings.invertMouseY;
    if (typeof settings.invertGamepadY === "boolean") this.invertGamepadY = settings.invertGamepadY;
    if (typeof settings.gamepadDeadZone === "number") this.gamepad.deadZone = settings.gamepadDeadZone;
  }

  public connect(): void {
    if (this.connected) {
      return;
    }
    this.keyboard.connect();
    this.pointerTarget?.addEventListener("pointermove", this.mouseMoveBound);
    this.connected = true;
  }

  public disconnect(): void {
    if (!this.connected) {
      return;
    }
    this.keyboard.disconnect();
    this.pointerTarget?.removeEventListener("pointermove", this.mouseMoveBound);
    this.connected = false;
    this.clear();
  }

  public dispose(): void {
    this.disconnect();
  }

  /** Sample physical devices and cache a stable state for this frame. */
  public update(): void {
    this.resetFrameState();
    this.gamepad.update();

    if (!this.enabled) {
      this.keyboard.endFrame();
      this.gamepad.endFrame();
      return;
    }

    this.frameMouseX = this.mouseX;
    this.frameMouseY = this.mouseY;
    this.mouseX = 0;
    this.mouseY = 0;

    for (const action of INPUT_ACTIONS) {
      this.sampleAction(action);
    }
    this.sampleAxes();

    this.keyboard.endFrame();
    this.gamepad.endFrame();
  }

  public isDown(action: InputAction): boolean {
    return this.actionStates[action].down;
  }

  public wasPressed(action: InputAction): boolean {
    return this.actionStates[action].pressed;
  }

  public wasReleased(action: InputAction): boolean {
    return this.actionStates[action].released;
  }

  /** Read and clear an edge action, ideal for pause/menu/reset commands. */
  public consumePressed(action: InputAction): boolean {
    const state = this.actionStates[action];
    if (!state.pressed) {
      return false;
    }
    state.pressed = false;
    return true;
  }

  public consumeReleased(action: InputAction): boolean {
    const state = this.actionStates[action];
    if (!state.released) {
      return false;
    }
    state.released = false;
    return true;
  }

  public getAxis(axis: InputAxis): number {
    return this.axisValues[axis];
  }

  public getMoveVector(): InputVector {
    return { x: this.axisValues.moveX, y: this.axisValues.moveY };
  }

  public getCameraVector(): InputVector {
    return { x: this.axisValues.cameraX, y: this.axisValues.cameraY };
  }

  public snapshot(): InputManagerSnapshot {
    const actions = {} as Record<InputAction, InputActionState>;
    for (const action of INPUT_ACTIONS) {
      actions[action] = { ...this.actionStates[action] };
    }
    return {
      device: this._activeDevice,
      axes: { ...this.axisValues },
      actions
    };
  }

  public clear(): void {
    this.keyboard.clear();
    this.mouseX = 0;
    this.mouseY = 0;
    this.frameMouseX = 0;
    this.frameMouseY = 0;
    this.resetFrameState();
  }

  private handlePointerMove(event: Pick<MouseEvent, "movementX" | "movementY" | "target">): void {
    if (!this.enabled || isTextEntryTarget(event.target)) {
      return;
    }
    const movementX = Number.isFinite(event.movementX) ? event.movementX : 0;
    const movementY = Number.isFinite(event.movementY) ? event.movementY : 0;
    this.mouseX += movementX;
    this.mouseY += movementY;
    if (movementX !== 0 || movementY !== 0) {
      this._activeDevice = "mouse";
    }
  }

  private resetFrameState(): void {
    for (const action of INPUT_ACTIONS) {
      const state = this.actionStates[action];
      state.down = false;
      state.pressed = false;
      state.released = false;
      state.device = null;
    }
    this.axisValues.moveX = 0;
    this.axisValues.moveY = 0;
    this.axisValues.cameraX = 0;
    this.axisValues.cameraY = 0;
  }

  private sampleAction(action: InputAction): void {
    const state = this.actionStates[action];
    const keyboardCodes = this.keyboardBindings[action] ?? DEFAULT_KEYBOARD_BINDINGS[action];
    const gamepadButtons = this.gamepadBindings[action] ?? [];

    for (const code of keyboardCodes) {
      if (this.keyboard.isDown(code)) {
        state.down = true;
        state.device = "keyboard";
        this._activeDevice = "keyboard";
      }
      if (this.keyboard.wasPressed(code)) {
        state.pressed = true;
        state.device = "keyboard";
        this._activeDevice = "keyboard";
      }
      if (this.keyboard.wasReleased(code)) {
        state.released = true;
        state.device ??= "keyboard";
      }
    }

    for (const button of gamepadButtons) {
      if (this.gamepad.isButtonDown(button)) {
        state.down = true;
        state.device = "gamepad";
        this._activeDevice = "gamepad";
      }
      if (this.gamepad.wasButtonPressed(button)) {
        state.pressed = true;
        state.device = "gamepad";
        this._activeDevice = "gamepad";
      }
      if (this.gamepad.wasButtonReleased(button)) {
        state.released = true;
        state.device ??= "gamepad";
      }
    }
  }

  private sampleAxes(): void {
    const keyboardMoveX = Number(this.isDown("moveRight")) - Number(this.isDown("moveLeft"));
    const keyboardMoveY = Number(this.isDown("moveForward")) - Number(this.isDown("moveBackward"));
    const keyboardCameraX = Number(this.isDown("cameraRight")) - Number(this.isDown("cameraLeft"));
    const keyboardCameraY = Number(this.isDown("cameraUp")) - Number(this.isDown("cameraDown"));
    const leftStick = this.gamepad.getLeftStick();
    const rightStick = this.gamepad.getRightStick();
    // Standard gamepad axes report stick-up as negative Y. Normalize it to the
    // same positive-is-look-up convention used by keyboard and mouse input.
    const gamepadCameraY = this.invertGamepadY ? rightStick.y : -rightStick.y;
    const mouseCameraY = this.invertMouseY ? this.frameMouseY : -this.frameMouseY;

    this.axisValues.moveX = clampInput(
      Math.abs(leftStick.x) > Math.abs(keyboardMoveX) ? leftStick.x : keyboardMoveX
    );
    this.axisValues.moveY = clampInput(
      Math.abs(leftStick.y) > Math.abs(keyboardMoveY) ? leftStick.y : keyboardMoveY
    );
    this.axisValues.cameraX = clampInput(
      keyboardCameraX + rightStick.x + this.frameMouseX * this._mouseSensitivity
    );
    this.axisValues.cameraY = clampInput(
      keyboardCameraY + gamepadCameraY + mouseCameraY * this._mouseSensitivity
    );

    if (
      Math.abs(leftStick.x) > 0.001 ||
      Math.abs(leftStick.y) > 0.001 ||
      Math.abs(rightStick.x) > 0.001 ||
      Math.abs(rightStick.y) > 0.001
    ) {
      this._activeDevice = "gamepad";
    }
  }
}
