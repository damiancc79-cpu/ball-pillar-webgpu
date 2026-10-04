import type { InputDevice } from "../input/InputActions";

export type PauseMenuAction = "resume" | "restart" | "options" | "controls" | "menu";

export interface PauseMenuUIOptions {
  document: Document;
  onAction: (action: PauseMenuAction) => void;
}

const PAUSE_ITEMS: readonly { action: PauseMenuAction; label: string }[] = [
  { action: "resume", label: "RESUME SIGNAL" },
  { action: "restart", label: "RESTART CHECKPOINT" },
  { action: "options", label: "OPTIONS" },
  { action: "controls", label: "CONTROLS" },
  { action: "menu", label: "RETURN TO MENU" }
];

/** Compact pause overlay with the same selection semantics as the title menu. */
export class PauseMenuUI {
  public readonly element: HTMLElement;
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly hint: HTMLElement;
  private selectedIndex = 0;

  public constructor(options: PauseMenuUIOptions) {
    const { document: documentRef } = options;
    this.element = documentRef.createElement("section");
    this.element.className = "menu-panel pause-menu";
    this.element.setAttribute("aria-label", "Paused game menu");

    const title = documentRef.createElement("h2");
    title.className = "menu-panel__title";
    title.textContent = "SIGNAL PAUSED";
    const copy = documentRef.createElement("p");
    copy.className = "menu-panel__subtitle";
    copy.textContent = "THE MACHINE IS HOLDING POSITION";
    const list = documentRef.createElement("div");
    list.className = "menu-list";

    for (const [index, item] of PAUSE_ITEMS.entries()) {
      const button = documentRef.createElement("button");
      button.type = "button";
      button.className = "menu-list__item";
      button.textContent = item.label;
      button.addEventListener("mouseenter", () => this.select(index, false));
      button.addEventListener("focus", () => this.select(index, false));
      button.addEventListener("click", () => options.onAction(item.action));
      this.buttons.push(button);
      list.append(button);
    }
    this.hint = documentRef.createElement("p");
    this.hint.className = "menu-panel__hint";
    this.setInputDevice("keyboard");
    this.element.append(title, copy, list, this.hint);
    this.select(0, false);
  }

  public setVisible(visible: boolean): void {
    this.element.hidden = !visible;
    if (visible) {
      this.select(this.selectedIndex, false);
    }
  }

  public selectNext(direction: 1 | -1, focus = true): void {
    this.select((this.selectedIndex + direction + this.buttons.length) % this.buttons.length, focus);
  }

  public select(index: number, focus = true): void {
    this.selectedIndex = Math.max(0, Math.min(this.buttons.length - 1, index));
    this.buttons.forEach((button, buttonIndex) =>
      button.classList.toggle("is-selected", buttonIndex === this.selectedIndex)
    );
    if (focus && !this.element.hidden) {
      this.buttons[this.selectedIndex].focus({ preventScroll: true });
    }
  }

  public activateSelected(): void {
    this.buttons[this.selectedIndex]?.click();
  }

  public setInputDevice(device: InputDevice): void {
    this.hint.textContent = device === "gamepad" ? "MENU / B TO RESUME" : "ESC TO RESUME";
  }

  public destroy(): void {
    this.element.remove();
  }
}
