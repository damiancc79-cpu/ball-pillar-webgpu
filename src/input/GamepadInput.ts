import { applyRadialDeadZone, clampInput, type InputVector } from "./InputActions";

export interface GamepadButtonLike {
  pressed: boolean;
  value: number;
}

export interface GamepadLike {
  connected: boolean;
  id: string;
  index: number;
  axes: readonly number[];
  buttons: readonly GamepadButtonLike[];
}

export interface GamepadNavigatorLike {
  getGamepads(): ArrayLike<GamepadLike | null>;
}

export interface GamepadInputOptions {
  navigator?: GamepadNavigatorLike;
  deadZone?: number;
  buttonThreshold?: number;
}

export interface GamepadInputSnapshot {
  connected: boolean;
  id: string | null;
  index: number | null;
  axes: readonly number[];
}

function getDefaultNavigator(): GamepadNavigatorLike | undefined {
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") {
    return undefined;
  }
  return navigator;
}

/** Polling Gamepad API adapter with stable edge detection and radial dead zones. */
export class GamepadInput {
  private readonly navigatorSource?: GamepadNavigatorLike;
  private readonly buttonThreshold: number;
  private previousButtons: boolean[] = [];
  private currentButtons: boolean[] = [];
  private pressedButtons = new Set<number>();
  private releasedButtons = new Set<number>();
  private axes: number[] = [];
  private currentGamepad: GamepadLike | null = null;
  private preferredIndex: number | null = null;
  private _deadZone: number;

  public constructor(options: GamepadInputOptions = {}) {
    this.navigatorSource = options.navigator ?? getDefaultNavigator();
    this._deadZone = Math.max(0, Math.min(0.95, options.deadZone ?? 0.16));
    this.buttonThreshold = Math.max(0, Math.min(1, options.buttonThreshold ?? 0.25));
  }

  public get deadZone(): number {
    return this._deadZone;
  }

  public set deadZone(value: number) {
    this._deadZone = Math.max(0, Math.min(0.95, value));
  }

  public get connected(): boolean {
    return this.currentGamepad !== null;
  }

  public get id(): string | null {
    return this.currentGamepad?.id ?? null;
  }

  public get index(): number | null {
    return this.currentGamepad?.index ?? null;
  }

  public update(): void {
    const pads = this.navigatorSource?.getGamepads();
    const selected = this.selectGamepad(pads);
    this.currentGamepad = selected;
    this.pressedButtons.clear();
    this.releasedButtons.clear();

    if (!selected) {
      for (let index = 0; index < this.previousButtons.length; index += 1) {
        if (this.previousButtons[index]) {
          this.releasedButtons.add(index);
        }
      }
      this.previousButtons = [];
      this.currentButtons = [];
      this.axes = [];
      return;
    }

    this.preferredIndex = selected.index;
    this.axes = Array.from(selected.axes, clampInput);
    this.currentButtons = selected.buttons.map(
      (button) => button.pressed || button.value >= this.buttonThreshold
    );

    const buttonCount = Math.max(this.previousButtons.length, this.currentButtons.length);
    for (let index = 0; index < buttonCount; index += 1) {
      const wasDown = this.previousButtons[index] ?? false;
      const isDown = this.currentButtons[index] ?? false;
      if (isDown && !wasDown) {
        this.pressedButtons.add(index);
      }
      if (!isDown && wasDown) {
        this.releasedButtons.add(index);
      }
    }
    this.previousButtons = [...this.currentButtons];
  }

  public getAxis(index: number): number {
    return this.axes[index] ?? 0;
  }

  public getStick(axisX: number, axisY: number, invertY = false): InputVector {
    return applyRadialDeadZone(
      this.getAxis(axisX),
      invertY ? -this.getAxis(axisY) : this.getAxis(axisY),
      this._deadZone
    );
  }

  public getLeftStick(): InputVector {
    return this.getStick(0, 1, true);
  }

  public getRightStick(): InputVector {
    return this.getStick(2, 3, false);
  }

  public isButtonDown(index: number): boolean {
    return this.currentButtons[index] ?? false;
  }

  public wasButtonPressed(index: number): boolean {
    return this.pressedButtons.has(index);
  }

  public wasButtonReleased(index: number): boolean {
    return this.releasedButtons.has(index);
  }

  public consumeButtonPressed(index: number): boolean {
    return this.pressedButtons.delete(index);
  }

  public endFrame(): void {
    this.pressedButtons.clear();
    this.releasedButtons.clear();
  }

  public snapshot(): GamepadInputSnapshot {
    return {
      connected: this.connected,
      id: this.id,
      index: this.index,
      axes: [...this.axes]
    };
  }

  private selectGamepad(pads: ArrayLike<GamepadLike | null> | undefined): GamepadLike | null {
    if (!pads) {
      return null;
    }
    if (this.preferredIndex !== null) {
      const preferred = pads[this.preferredIndex];
      if (preferred?.connected) {
        return preferred;
      }
    }
    for (let index = 0; index < pads.length; index += 1) {
      const pad = pads[index];
      if (pad?.connected) {
        return pad;
      }
    }
    return null;
  }
}
