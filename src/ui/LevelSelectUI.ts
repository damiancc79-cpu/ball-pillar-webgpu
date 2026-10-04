import type { InputDevice } from "../input/InputActions";
import type { LevelDefinition } from "../level/LevelDefinition";

export interface LevelSelectUIOptions {
  document: Document;
  levels: readonly LevelDefinition[];
  onSelect: (levelId: string) => void;
  onBack: () => void;
}

export interface LevelSelectProgress {
  completedLevelIds: readonly string[];
  unlockedLevelIds: readonly string[];
}

/** Campaign selector with the same keyboard/gamepad navigation as the main menu. */
export class LevelSelectUI {
  public readonly element: HTMLElement;
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly detail: HTMLElement;
  private readonly hint: HTMLElement;
  private selectedIndex = 0;
  private completedLevelIds = new Set<string>();
  private unlockedLevelIds = new Set<string>();

  public constructor(private readonly options: LevelSelectUIOptions) {
    const { document: documentRef, levels } = options;
    this.element = documentRef.createElement("section");
    this.element.className = "menu-panel level-select-menu";
    this.element.setAttribute("aria-label", "Level select");

    const eyebrow = documentRef.createElement("p");
    eyebrow.className = "menu-panel__eyebrow";
    eyebrow.textContent = "PILLAR NETWORK // CAMPAIGN MAP";
    const title = documentRef.createElement("h2");
    title.className = "menu-panel__title";
    title.textContent = "LEVEL SELECT";
    const subtitle = documentRef.createElement("p");
    subtitle.className = "menu-panel__subtitle";
    subtitle.textContent = "TRAIN FIRST. FACE THE FULL MACHINE LAST.";
    const list = documentRef.createElement("div");
    list.className = "menu-list";
    list.setAttribute("role", "menu");

    for (const [index, level] of levels.entries()) {
      const button = documentRef.createElement("button");
      button.type = "button";
      button.className = "menu-list__item";
      button.dataset.levelId = level.id;
      button.setAttribute("role", "menuitem");
      button.innerHTML = `<span class="menu-list__index">${String(index + 1).padStart(2, "0")}</span><span>${level.name}</span>`;
      button.addEventListener("mouseenter", () => this.select(index, false));
      button.addEventListener("focus", () => this.select(index, false));
      button.addEventListener("click", () => options.onSelect(level.id));
      this.buttons.push(button);
      list.append(button);
    }

    this.detail = documentRef.createElement("p");
    this.detail.className = "menu-panel__detail";
    this.hint = documentRef.createElement("p");
    this.hint.className = "menu-panel__hint";
    const back = documentRef.createElement("button");
    back.type = "button";
    back.className = "ui-button ui-button--muted";
    back.textContent = "BACK TO MENU";
    back.addEventListener("click", options.onBack);
    this.element.append(eyebrow, title, subtitle, list, this.detail, this.hint, back);
    this.setInputDevice("keyboard");
    this.setProgress({
      completedLevelIds: [],
      unlockedLevelIds: levels[0] ? [levels[0].id] : []
    });
    this.select(0, false);
  }

  public setVisible(visible: boolean): void {
    this.element.hidden = !visible;
    if (visible) {
      this.select(this.selectedIndex, false);
    }
  }

  public selectNext(direction: 1 | -1, focus = true): void {
    if (this.buttons.length === 0) {
      return;
    }
    for (let offset = 1; offset <= this.buttons.length; offset += 1) {
      const candidate = (this.selectedIndex + direction * offset + this.buttons.length) % this.buttons.length;
      if (!this.buttons[candidate]?.disabled) {
        this.select(candidate, focus);
        return;
      }
    }
  }

  public select(index: number, focus = true): void {
    this.selectedIndex = Math.max(0, Math.min(this.buttons.length - 1, index));
    this.buttons.forEach((button, buttonIndex) => {
      const selected = buttonIndex === this.selectedIndex;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-current", selected ? "true" : "false");
    });
    const level = this.options.levels[this.selectedIndex];
    const unlocked = this.unlockedLevelIds.has(level.id);
    if (!unlocked) {
      const previous = this.options.levels[this.selectedIndex - 1];
      this.detail.textContent = `LOCKED // COMPLETE ${previous?.name ?? "TRAINING"} TO UNLOCK`;
    } else {
      const cleared = this.completedLevelIds.has(level.id) ? " // CLEARED" : "";
      this.detail.textContent = `${level.difficulty ?? "TRAINING"} // ${level.objective ?? level.subtitle ?? "READY"}${cleared}`;
    }
    if (focus && !this.element.hidden) {
      this.buttons[this.selectedIndex]?.focus({ preventScroll: true });
    }
  }

  public setProgress(progress: LevelSelectProgress): void {
    this.completedLevelIds = new Set(progress.completedLevelIds);
    this.unlockedLevelIds = new Set(progress.unlockedLevelIds);
    this.buttons.forEach((button, index) => {
      const level = this.options.levels[index];
      const unlocked = this.unlockedLevelIds.has(level.id);
      const cleared = this.completedLevelIds.has(level.id);
      button.disabled = !unlocked;
      button.dataset.locked = unlocked ? "false" : "true";
      button.dataset.cleared = cleared ? "true" : "false";
      button.setAttribute("aria-disabled", unlocked ? "false" : "true");
    });
    if (this.buttons[this.selectedIndex]?.disabled) {
      const firstUnlocked = this.buttons.findIndex((button) => !button.disabled);
      this.selectedIndex = Math.max(0, firstUnlocked);
    }
    this.select(this.selectedIndex, false);
  }

  public activateSelected(): void {
    this.buttons[this.selectedIndex]?.click();
  }

  public setInputDevice(device: InputDevice): void {
    this.hint.textContent =
      device === "gamepad"
        ? "D-PAD TO CHOOSE   ·   A TO DEPLOY   ·   B TO BACK"
        : "↑ ↓ TO CHOOSE   ·   ENTER TO DEPLOY   ·   ESC TO BACK";
  }

  public destroy(): void {
    this.element.remove();
  }
}
