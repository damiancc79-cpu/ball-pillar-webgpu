import type { InputDevice } from "../input/InputActions";

export type MainMenuAction = "start" | "level-select" | "options" | "controls" | "credits" | "exit";

export interface MainMenuUIOptions {
  document: Document;
  onAction: (action: MainMenuAction) => void;
}

interface MenuItem {
  action: MainMenuAction;
  label: string;
  detail: string;
}

const MENU_ITEMS: readonly MenuItem[] = [
  { action: "start", label: "START DEMO", detail: "ROLL INTO THE MACHINE" },
  { action: "level-select", label: "LEVEL SELECT", detail: "TRAINING ROUTES · FINAL ASCENT" },
  { action: "options", label: "OPTIONS", detail: "AUDIO · VIDEO · CONTROL" },
  { action: "controls", label: "CONTROLS", detail: "KEYBOARD · GAMEPAD" },
  { action: "credits", label: "CREDITS", detail: "THE CREW BEHIND THE SIGNAL" },
  { action: "exit", label: "EXIT MENU", detail: "RETURN TO TITLE TRANSMISSION" }
];

/** Reusable selectable list shared by a real-time menu scene and HTML overlay. */
export class MainMenuUI {
  public readonly element: HTMLElement;
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly detail: HTMLElement;
  private readonly hint: HTMLElement;
  private selectedIndex = 0;

  public constructor(options: MainMenuUIOptions) {
    const { document: documentRef } = options;
    this.element = documentRef.createElement("section");
    this.element.className = "menu-panel main-menu";
    this.element.setAttribute("aria-label", "Main menu");

    const eyebrow = documentRef.createElement("p");
    eyebrow.className = "menu-panel__eyebrow";
    eyebrow.textContent = "STATION 07 // WEBGPU TRANSMISSION";
    const title = documentRef.createElement("h1");
    title.className = "menu-panel__title";
    title.innerHTML = "BALL <span>PILLAR</span>";
    const subtitle = documentRef.createElement("p");
    subtitle.className = "menu-panel__subtitle";
    subtitle.textContent = "A PHYSICS SIGNAL FROM 2000";
    const list = documentRef.createElement("div");
    list.className = "menu-list";
    list.setAttribute("role", "menu");

    for (const [index, item] of MENU_ITEMS.entries()) {
      const button = documentRef.createElement("button");
      button.type = "button";
      button.className = "menu-list__item";
      button.dataset.menuAction = item.action;
      button.setAttribute("role", "menuitem");
      button.innerHTML = `<span class="menu-list__index">${String(index + 1).padStart(2, "0")}</span><span>${item.label}</span>`;
      button.addEventListener("mouseenter", () => this.select(index, false));
      button.addEventListener("focus", () => this.select(index, false));
      button.addEventListener("click", () => options.onAction(item.action));
      this.buttons.push(button);
      list.append(button);
    }

    this.detail = documentRef.createElement("p");
    this.detail.className = "menu-panel__detail";
    this.hint = documentRef.createElement("p");
    this.hint.className = "menu-panel__hint";
    this.setInputDevice("keyboard");
    this.element.append(eyebrow, title, subtitle, list, this.detail, this.hint);
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
    this.buttons.forEach((button, buttonIndex) => {
      const selected = buttonIndex === this.selectedIndex;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-current", selected ? "true" : "false");
    });
    this.detail.textContent = MENU_ITEMS[this.selectedIndex].detail;
    if (focus && !this.element.hidden) {
      this.buttons[this.selectedIndex].focus({ preventScroll: true });
    }
  }

  public activateSelected(): void {
    this.buttons[this.selectedIndex]?.click();
  }

  public setInputDevice(device: InputDevice): void {
    this.hint.textContent =
      device === "gamepad"
        ? "D-PAD TO NAVIGATE   ·   A TO SELECT   ·   B TO BACK"
        : "↑ ↓ TO NAVIGATE   ·   ENTER TO SELECT   ·   ESC TO BACK";
  }

  public destroy(): void {
    this.element.remove();
  }
}
