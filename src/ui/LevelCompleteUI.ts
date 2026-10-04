import type { InputDevice } from "../input/InputActions";
import type { LevelDefinition } from "../level/LevelDefinition";

export interface LevelCompleteUIOptions {
  document: Document;
  onNextLevel: (levelId: string) => void;
  onReturnToMenu: () => void;
}

/** Course-aware completion panel: early clears advance, the finale closes the campaign. */
export class LevelCompleteUI {
  public readonly element: HTMLElement;
  private readonly title: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly menuButton: HTMLButtonElement;
  private nextLevelId: string | undefined;
  private selectedIndex = 0;

  public constructor(private readonly options: LevelCompleteUIOptions) {
    const { document: documentRef } = options;
    this.element = documentRef.createElement("section");
    this.element.className = "menu-panel complete-menu";
    this.element.setAttribute("aria-label", "Course complete");

    const eyebrow = documentRef.createElement("p");
    eyebrow.className = "menu-panel__eyebrow";
    eyebrow.textContent = "PILLAR NETWORK // COURSE COMPLETE";
    this.title = documentRef.createElement("h2");
    this.title.className = "menu-panel__title";
    this.subtitle = documentRef.createElement("p");
    this.subtitle.className = "menu-panel__subtitle";
    this.detail = documentRef.createElement("p");
    this.detail.className = "menu-panel__detail";

    const actions = documentRef.createElement("div");
    actions.className = "complete-menu__actions";
    this.nextButton = documentRef.createElement("button");
    this.nextButton.type = "button";
    this.nextButton.className = "ui-button";
    this.nextButton.textContent = "NEXT COURSE";
    this.nextButton.addEventListener("click", () => this.activateNext());
    this.menuButton = documentRef.createElement("button");
    this.menuButton.type = "button";
    this.menuButton.className = "ui-button ui-button--muted";
    this.menuButton.textContent = "RETURN TO MENU";
    this.menuButton.addEventListener("click", () => this.returnToMenu());
    actions.append(this.nextButton, this.menuButton);
    this.element.append(eyebrow, this.title, this.subtitle, this.detail, actions);
    this.title.textContent = "COURSE CLEAR";
    this.subtitle.textContent = "COURSE DATA READY.";
    this.detail.textContent = "RETURN TO THE NETWORK MAP.";
    this.nextButton.hidden = true;
    this.refreshSelection(false);
  }

  public setResult(level: LevelDefinition, nextLevel?: LevelDefinition): void {
    this.nextLevelId = nextLevel?.id;
    const isFinal = !nextLevel;
    this.title.textContent = isFinal ? "EXIT SIGNAL FOUND" : "COURSE CLEAR";
    this.subtitle.textContent = isFinal
      ? "THE PILLAR NETWORK HAS RELEASED YOU."
      : `${level.name} COMPLETE // NEW SIGNAL UNLOCKED.`;
    this.detail.textContent = isFinal
      ? "FINAL ASCENT COMPLETE // CHECKPOINT DATA ARCHIVED"
      : `NEXT COURSE // ${nextLevel.name}`;
    this.nextButton.hidden = !nextLevel;
    this.selectedIndex = 0;
    this.refreshSelection(false);
  }

  public setVisible(visible: boolean): void {
    this.element.hidden = !visible;
    if (visible) {
      this.refreshSelection(true);
    }
  }

  public selectNext(direction: 1 | -1, focus = true): void {
    const selectable = this.nextLevelId ? [0, 1] : [1];
    const currentIndex = Math.max(0, selectable.indexOf(this.selectedIndex));
    this.selectedIndex = selectable[(currentIndex + direction + selectable.length) % selectable.length];
    this.refreshSelection(focus);
  }

  public activateSelected(): void {
    if (this.selectedIndex === 0 && this.nextLevelId) {
      this.activateNext();
      return;
    }
    this.returnToMenu();
  }

  public returnToMenu(): void {
    this.options.onReturnToMenu();
  }

  public setInputDevice(device: InputDevice): void {
    this.menuButton.dataset.inputDevice = device;
  }

  public destroy(): void {
    this.element.remove();
  }

  private activateNext(): void {
    if (this.nextLevelId) {
      this.options.onNextLevel(this.nextLevelId);
    }
  }

  private refreshSelection(focus: boolean): void {
    const useNext = this.nextLevelId && this.selectedIndex === 0;
    this.nextButton.classList.toggle("is-selected", Boolean(useNext));
    this.menuButton.classList.toggle("is-selected", !useNext);
    if (focus && !this.element.hidden) {
      (useNext ? this.nextButton : this.menuButton).focus({ preventScroll: true });
    }
  }
}
