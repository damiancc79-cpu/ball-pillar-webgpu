export interface KeyboardInputOptions {
  /** Event target to listen on.  Passing undefined makes the instance manual-only. */
  target?: EventTarget;
  /** Prevent browser scrolling for movement keys while the game has focus. */
  preventDefaultCodes?: readonly string[];
  /** Ignore repeated keydown events for edge-triggered actions. */
  ignoreRepeat?: boolean;
}

export interface KeyboardInputSnapshot {
  down: readonly string[];
  pressed: readonly string[];
  released: readonly string[];
}

const DEFAULT_PREVENT_DEFAULT_CODES = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);

/**
 * A small DOM keyboard adapter.  It intentionally stores only KeyboardEvent
 * `code` values, so bindings are stable across keyboard layouts.
 */
export class KeyboardInput {
  private readonly downCodes = new Set<string>();
  private readonly pressedCodes = new Set<string>();
  private readonly releasedCodes = new Set<string>();
  private readonly target?: EventTarget;
  private readonly preventDefaultCodes: ReadonlySet<string>;
  private readonly ignoreRepeat: boolean;
  private connected = false;

  private readonly onKeyDownBound = (event: Event): void => {
    this.handleKeyDown(event as KeyboardEvent);
  };

  private readonly onKeyUpBound = (event: Event): void => {
    this.handleKeyUp(event as KeyboardEvent);
  };

  private readonly onBlurBound = (): void => {
    this.clear();
  };

  public constructor(options: KeyboardInputOptions = {}) {
    this.target = options.target;
    this.preventDefaultCodes = new Set(options.preventDefaultCodes ?? DEFAULT_PREVENT_DEFAULT_CODES);
    this.ignoreRepeat = options.ignoreRepeat ?? true;
  }

  public connect(): void {
    if (this.connected || !this.target) {
      return;
    }
    this.target.addEventListener("keydown", this.onKeyDownBound);
    this.target.addEventListener("keyup", this.onKeyUpBound);
    this.target.addEventListener("blur", this.onBlurBound);
    this.connected = true;
  }

  public disconnect(): void {
    if (!this.connected || !this.target) {
      return;
    }
    this.target.removeEventListener("keydown", this.onKeyDownBound);
    this.target.removeEventListener("keyup", this.onKeyUpBound);
    this.target.removeEventListener("blur", this.onBlurBound);
    this.connected = false;
    this.clear();
  }

  public dispose(): void {
    this.disconnect();
  }

  public handleKeyDown(event: Pick<KeyboardEvent, "code" | "repeat" | "preventDefault">): void {
    if (!event.code) {
      return;
    }
    if (this.preventDefaultCodes.has(event.code)) {
      event.preventDefault();
    }
    if (this.ignoreRepeat && event.repeat) {
      return;
    }
    if (!this.downCodes.has(event.code)) {
      this.pressedCodes.add(event.code);
    }
    this.downCodes.add(event.code);
  }

  public handleKeyUp(event: Pick<KeyboardEvent, "code" | "preventDefault">): void {
    if (!event.code) {
      return;
    }
    if (this.preventDefaultCodes.has(event.code)) {
      event.preventDefault();
    }
    if (this.downCodes.delete(event.code)) {
      this.releasedCodes.add(event.code);
    }
  }

  public isDown(code: string): boolean {
    return this.downCodes.has(code);
  }

  public wasPressed(code: string): boolean {
    return this.pressedCodes.has(code);
  }

  public wasReleased(code: string): boolean {
    return this.releasedCodes.has(code);
  }

  public consumePressed(code: string): boolean {
    return this.pressedCodes.delete(code);
  }

  public consumeReleased(code: string): boolean {
    return this.releasedCodes.delete(code);
  }

  /** Call after consumers have sampled this frame's edge states. */
  public endFrame(): void {
    this.pressedCodes.clear();
    this.releasedCodes.clear();
  }

  public clear(): void {
    this.downCodes.clear();
    this.endFrame();
  }

  public snapshot(): KeyboardInputSnapshot {
    return {
      down: [...this.downCodes],
      pressed: [...this.pressedCodes],
      released: [...this.releasedCodes]
    };
  }
}
