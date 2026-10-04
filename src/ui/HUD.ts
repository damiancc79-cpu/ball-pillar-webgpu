export interface HUDState {
  speed?: number;
  checkpoint?: string;
  elapsedSeconds?: number;
  showTimer?: boolean;
  prompt?: string;
  status?: string;
}

export interface HUDOptions {
  document: Document;
  onJump?: () => void;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  documentRef: Document,
  tagName: K,
  className: string,
  text = ""
): HTMLElementTagNameMap[K] {
  const element = documentRef.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const seconds = Math.floor(Math.max(0, totalSeconds) % 60);
  const centiseconds = Math.floor((Math.max(0, totalSeconds) % 1) * 100);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${centiseconds
    .toString()
    .padStart(2, "0")}`;
}

/** Minimal in-game telemetry; it deliberately stays away from the center view. */
export class HUD {
  public readonly element: HTMLElement;
  private readonly speedValue: HTMLElement;
  private readonly checkpointValue: HTMLElement;
  private readonly timerValue: HTMLElement;
  private readonly promptValue: HTMLElement;
  private readonly notification: HTMLElement;
  private readonly jumpButton: HTMLButtonElement;
  private notificationTimer: number | undefined;
  private state: Required<HUDState> = {
    speed: 0,
    checkpoint: "START PLATFORM",
    elapsedSeconds: 0,
    showTimer: true,
    prompt: "",
    status: ""
  };

  public constructor(options: HUDOptions) {
    const { document: documentRef } = options;
    this.element = createElement(documentRef, "section", "hud", "");
    this.element.setAttribute("aria-label", "Game status");

    const telemetry = createElement(documentRef, "div", "hud__telemetry");
    const speed = createElement(documentRef, "div", "hud__metric");
    speed.append(createElement(documentRef, "span", "hud__label", "SPEED"));
    this.speedValue = createElement(documentRef, "strong", "hud__value", "000");
    speed.append(this.speedValue);

    const checkpoint = createElement(documentRef, "div", "hud__checkpoint");
    checkpoint.append(createElement(documentRef, "span", "hud__label", "CHECKPOINT"));
    this.checkpointValue = createElement(documentRef, "strong", "hud__checkpoint-value", "START PLATFORM");
    checkpoint.append(this.checkpointValue);

    const timer = createElement(documentRef, "div", "hud__timer");
    timer.append(createElement(documentRef, "span", "hud__label", "TIME"));
    this.timerValue = createElement(documentRef, "strong", "hud__timer-value", "00:00.00");
    timer.append(this.timerValue);
    telemetry.append(speed, checkpoint, timer);

    this.promptValue = createElement(documentRef, "div", "hud__prompt");
    this.notification = createElement(documentRef, "div", "hud__notification", "");
    this.notification.setAttribute("role", "status");
    this.notification.setAttribute("aria-live", "polite");
    this.jumpButton = documentRef.createElement("button");
    this.jumpButton.type = "button";
    this.jumpButton.className = "hud__jump";
    this.jumpButton.textContent = "JUMP";
    this.jumpButton.setAttribute("aria-label", "Jump");
    this.jumpButton.addEventListener("click", () => options.onJump?.());
    this.element.append(telemetry, this.promptValue, this.notification, this.jumpButton);
    this.render();
  }

  public setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }

  public setState(state: HUDState): void {
    this.state = { ...this.state, ...state };
    this.render();
  }

  public notify(message: string, durationMs = 2400): void {
    if (this.notificationTimer !== undefined) {
      globalThis.clearTimeout(this.notificationTimer);
    }
    this.notification.textContent = message;
    this.notification.classList.toggle("is-visible", Boolean(message));
    if (message && durationMs > 0) {
      this.notificationTimer = globalThis.setTimeout(() => {
        this.notification.textContent = "";
        this.notification.classList.remove("is-visible");
        this.notificationTimer = undefined;
      }, durationMs) as unknown as number;
    }
  }

  public destroy(): void {
    if (this.notificationTimer !== undefined) {
      globalThis.clearTimeout(this.notificationTimer);
    }
    this.element.remove();
  }

  private render(): void {
    this.speedValue.textContent = Math.round(Math.max(0, this.state.speed)).toString().padStart(3, "0");
    this.checkpointValue.textContent = this.state.checkpoint || "START PLATFORM";
    this.timerValue.textContent = formatTime(this.state.elapsedSeconds);
    this.timerValue.parentElement!.hidden = !this.state.showTimer;
    this.promptValue.textContent = this.state.prompt || this.state.status;
    this.promptValue.classList.toggle("is-visible", Boolean(this.state.prompt || this.state.status));
  }
}
