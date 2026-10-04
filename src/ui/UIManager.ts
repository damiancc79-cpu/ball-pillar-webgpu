import type { InputAction, InputDevice } from "../input/InputActions";
import { CampaignProgress } from "../level/CampaignProgress";
import { CAMPAIGN_LEVELS } from "../level/LevelCatalog";
import type { LevelDefinition } from "../level/LevelDefinition";
import "../styles/global.css";
import "../styles/hud.css";
import "../styles/menus.css";
import {
  DeveloperPanel,
  type DeveloperMetrics,
  type DeveloperPanelOptions,
  type DeveloperTuning
} from "./DeveloperPanel";
import { HUD, type HUDState } from "./HUD";
import { LevelCompleteUI } from "./LevelCompleteUI";
import { LevelSelectUI } from "./LevelSelectUI";
import { MainMenuUI, type MainMenuAction } from "./MainMenuUI";
import { OptionsUI } from "./OptionsUI";
import { PauseMenuUI, type PauseMenuAction } from "./PauseMenuUI";
import { SettingsStore, type GameSettings, type StorageLike } from "./SettingsStore";

export type UIScreen =
  | "menu"
  | "level-select"
  | "game"
  | "pause"
  | "options"
  | "controls"
  | "credits"
  | "complete"
  | "compatibility"
  | "loading";

export interface UIInputReader {
  consumePressed(action: InputAction): boolean;
  activeDevice?: InputDevice;
}

export interface UIManagerCallbacks {
  onStart?: () => void;
  onResume?: () => void;
  onRestart?: () => void;
  onJump?: () => void;
  onReset?: () => void;
  onSettings?: (settings: Readonly<GameSettings>) => void;
  onExit?: () => void;
  onPauseChange?: (paused: boolean) => void;
  onLevelSelect?: (levelId: string) => void;
  onNextLevel?: (levelId: string) => void;
  onDeveloperTuning?: DeveloperPanelOptions["onTuningChange"];
  onDeveloperAction?: DeveloperPanelOptions["onAction"];
}

export interface UIManagerOptions {
  container?: HTMLElement;
  document?: Document;
  callbacks?: UIManagerCallbacks;
  settingsStore?: SettingsStore;
  storage?: StorageLike;
  developerTuning?: Partial<DeveloperTuning>;
}

interface SimplePanel {
  element: HTMLElement;
  setVisible(visible: boolean): void;
  destroy(): void;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function createSimplePanel(
  documentRef: Document,
  className: string,
  title: string,
  subtitle: string,
  lines: readonly string[],
  backLabel: string,
  onBack: () => void
): SimplePanel {
  const element = documentRef.createElement("section");
  element.className = `menu-panel ${className}`;
  const heading = documentRef.createElement("h2");
  heading.className = "menu-panel__title";
  heading.textContent = title;
  const lead = documentRef.createElement("p");
  lead.className = "menu-panel__subtitle";
  lead.textContent = subtitle;
  const list = documentRef.createElement("ul");
  list.className = "info-list";
  for (const line of lines) {
    const item = documentRef.createElement("li");
    item.textContent = line;
    list.append(item);
  }
  const back = documentRef.createElement("button");
  back.type = "button";
  back.className = "ui-button";
  back.textContent = backLabel;
  back.addEventListener("click", onBack);
  element.append(heading, lead, list, back);
  return {
    element,
    setVisible: (visible) => {
      element.hidden = !visible;
      if (visible) {
        back.focus({ preventScroll: true });
      }
    },
    destroy: () => element.remove()
  };
}

/**
 * Owns every DOM overlay above the renderer. The scene remains responsible for
 * 3D menu presentation; this class supplies focused controls, state screens,
 * settings persistence and a minimal in-game HUD.
 */
export class UIManager {
  public readonly root: HTMLElement;
  public readonly hud: HUD;
  public readonly developerPanel: DeveloperPanel;
  public readonly settingsStore: SettingsStore;
  public readonly campaignProgress: CampaignProgress;
  public readonly mainMenu: MainMenuUI;
  public readonly levelSelectMenu: LevelSelectUI;
  public readonly completeMenu: LevelCompleteUI;
  public readonly pauseMenu: PauseMenuUI;
  public readonly optionsMenu: OptionsUI;

  private readonly documentRef: Document;
  private readonly loadingPanel: HTMLElement;
  private readonly loadingProgress: HTMLOutputElement;
  private readonly compatibilityPanel: HTMLElement;
  private readonly compatibilityMessage: HTMLElement;
  private readonly controlsPanel: SimplePanel;
  private readonly creditsPanel: SimplePanel;
  private callbacks: UIManagerCallbacks;
  private _screen: UIScreen = "loading";
  private returnScreen: UIScreen = "menu";
  private unsubscribeSettings: (() => void) | undefined;
  private readonly developerShortcutBound = (event: Event): void =>
    this.handleDeveloperShortcut(event as KeyboardEvent);

  public constructor(options: UIManagerOptions = {}) {
    this.documentRef =
      options.document ??
      (typeof document !== "undefined"
        ? document
        : (() => {
            throw new Error("UIManager requires a DOM Document.");
          })());
    this.callbacks = { ...options.callbacks };
    this.settingsStore = options.settingsStore ?? new SettingsStore({ storage: options.storage });
    this.campaignProgress = new CampaignProgress({ storage: options.storage });
    const container = options.container ?? this.documentRef.body;
    this.root = this.documentRef.createElement("div");
    this.root.className = "game-ui";
    this.root.dataset.screen = "loading";
    container.append(this.root);

    this.mainMenu = new MainMenuUI({
      document: this.documentRef,
      onAction: (action) => this.handleMainMenuAction(action)
    });
    this.levelSelectMenu = new LevelSelectUI({
      document: this.documentRef,
      levels: CAMPAIGN_LEVELS,
      onSelect: (levelId) => this.callbacks.onLevelSelect?.(levelId),
      onBack: () => this.setScreen("menu")
    });
    this.levelSelectMenu.setProgress(this.campaignProgress.snapshot);
    this.completeMenu = new LevelCompleteUI({
      document: this.documentRef,
      onNextLevel: (levelId) => this.callbacks.onNextLevel?.(levelId),
      onReturnToMenu: () => this.setScreen("menu")
    });
    this.pauseMenu = new PauseMenuUI({
      document: this.documentRef,
      onAction: (action) => this.handlePauseMenuAction(action)
    });
    this.optionsMenu = new OptionsUI({
      document: this.documentRef,
      settings: this.settingsStore.settings,
      onChange: (patch) => this.setSettings(patch),
      onReset: () => {
        this.settingsStore.reset();
        this.hud.notify("SETTINGS RESET");
      },
      onBack: () => this.setScreen(this.returnScreen)
    });
    this.hud = new HUD({
      document: this.documentRef,
      onJump: () => this.callbacks.onJump?.()
    });
    this.developerPanel = new DeveloperPanel({
      document: this.documentRef,
      tuning: options.developerTuning,
      onTuningChange: (patch) => this.callbacks.onDeveloperTuning?.(patch),
      onAction: (action, tuning) => this.callbacks.onDeveloperAction?.(action, tuning)
    });

    this.loadingPanel = this.createLoadingPanel();
    this.loadingProgress = this.loadingPanel.querySelector("output")!;
    const compatibility = this.createCompatibilityPanel();
    this.compatibilityPanel = compatibility.panel;
    this.compatibilityMessage = compatibility.message;
    this.controlsPanel = createSimplePanel(
      this.documentRef,
      "controls-menu",
      "CONTROLS",
      "STEER THE ORBITAL SPHERE",
      [
        "WASD / ARROW KEYS — ROLL",
        "MOUSE / RIGHT STICK — CAMERA",
        "SPACE / A — JUMP",
        "X / LT — BRAKE",
        "SHIFT / RT — BOOST",
        "C / R3 — RECENTER CAMERA",
        "R / VIEW — RESET CHECKPOINT",
        "ESC / MENU — PAUSE"
      ],
      "BACK",
      () => this.setScreen(this.returnScreen)
    );
    this.creditsPanel = createSimplePanel(
      this.documentRef,
      "credits-menu",
      "CREDITS",
      "A SMALL MACHINE FOR A LARGE VOID",
      [
        "DESIGN + CODE — CODEX DEMO SYSTEM",
        "RENDERING — THREE.JS WEBGPU",
        "PHYSICS — RAPIER 3D",
        "AUDIO — WEB AUDIO API"
      ],
      "BACK",
      () => this.setScreen(this.returnScreen)
    );
    this.root.append(
      this.loadingPanel,
      this.compatibilityPanel,
      this.mainMenu.element,
      this.levelSelectMenu.element,
      this.pauseMenu.element,
      this.optionsMenu.element,
      this.controlsPanel.element,
      this.creditsPanel.element,
      this.completeMenu.element,
      this.hud.element,
      this.developerPanel.element
    );

    this.unsubscribeSettings = this.settingsStore.subscribe((settings) => {
      this.optionsMenu.setSettings(settings);
      this.callbacks.onSettings?.(settings);
    });
    this.documentRef.addEventListener("keydown", this.developerShortcutBound);
    this.setScreen("loading");
  }

  public get screen(): UIScreen {
    return this._screen;
  }

  public get settings(): Readonly<GameSettings> {
    return this.settingsStore.settings;
  }

  /** Replace only supplied callbacks; useful when App finishes asynchronous setup. */
  public configureCallbacks(callbacks: UIManagerCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
    if (callbacks.onSettings) {
      callbacks.onSettings(this.settings);
    }
  }

  public setScreen(screen: UIScreen): void {
    const previous = this._screen;
    this._screen = screen;
    this.root.dataset.screen = screen;
    this.loadingPanel.hidden = screen !== "loading";
    this.compatibilityPanel.hidden = screen !== "compatibility";
    this.mainMenu.setVisible(screen === "menu");
    this.levelSelectMenu.setVisible(screen === "level-select");
    this.pauseMenu.setVisible(screen === "pause");
    this.optionsMenu.setVisible(screen === "options");
    this.controlsPanel.setVisible(screen === "controls");
    this.creditsPanel.setVisible(screen === "credits");
    this.completeMenu.setVisible(screen === "complete");
    this.hud.setVisible(screen === "game");

    const wasPaused = previous === "pause";
    const isPaused = screen === "pause";
    if (wasPaused !== isPaused) {
      this.callbacks.onPauseChange?.(isPaused);
    }
  }

  public showLoading(progress = 0, label = "INITIALIZING WEBGPU"): void {
    this.setLoadingProgress(progress, label);
    this.setScreen("loading");
  }

  public setLoadingProgress(progress: number, label?: string): void {
    const clamped = Math.round(Math.max(0, Math.min(1, progress)) * 100);
    this.loadingProgress.value = String(clamped);
    this.loadingProgress.textContent = `${label ?? "LOADING MACHINE"} // ${clamped}%`;
  }

  public showCompatibility(message: string): void {
    this.compatibilityMessage.textContent = message;
    this.setScreen("compatibility");
  }

  public showComplete(level: LevelDefinition, nextLevel?: LevelDefinition): void {
    this.completeMenu.setResult(level, nextLevel);
    this.setScreen("complete");
  }

  /** Persist a clear and refresh the map lock state before presenting the result. */
  public completeCampaignLevel(levelId: string): LevelDefinition | undefined {
    const nextLevel = this.campaignProgress.complete(levelId);
    this.levelSelectMenu.setProgress(this.campaignProgress.snapshot);
    return nextLevel;
  }

  public isCampaignLevelUnlocked(levelId: string): boolean {
    return this.campaignProgress.isUnlocked(levelId);
  }

  public setHUDState(state: HUDState): void {
    this.hud.setState(state);
  }

  public notify(message: string, durationMs?: number): void {
    this.hud.notify(message, durationMs);
  }

  public setSettings(patch: Partial<GameSettings>): Readonly<GameSettings> {
    return this.settingsStore.update(patch);
  }

  public resetSettings(): Readonly<GameSettings> {
    return this.settingsStore.reset();
  }

  public setDeveloperMetrics(metrics: DeveloperMetrics): void {
    this.developerPanel.setMetrics(metrics);
  }

  public setDeveloperTuning(tuning: Partial<DeveloperTuning>): void {
    this.developerPanel.setTuning(tuning);
  }

  public toggleDeveloperPanel(): boolean {
    return this.developerPanel.toggle();
  }

  public setInputDevice(device: InputDevice): void {
    this.root.dataset.inputDevice = device;
    this.mainMenu.setInputDevice(device);
    this.levelSelectMenu.setInputDevice(device);
    this.completeMenu.setInputDevice(device);
    this.pauseMenu.setInputDevice(device);
  }

  /** Consume UI-relevant actions after the app has called InputManager.update(). */
  public update(input: UIInputReader): void {
    if (input.activeDevice) {
      this.setInputDevice(input.activeDevice);
    }
    if (this._screen === "game") {
      if (input.consumePressed("pause") || input.consumePressed("cancel")) {
        this.setScreen("pause");
      } else if (input.consumePressed("resetCheckpoint")) {
        this.callbacks.onReset?.();
      }
      return;
    }

    if (this._screen === "complete") {
      this.handleListInput(input, this.completeMenu);
      if (this._screen === "complete" && (input.consumePressed("cancel") || input.consumePressed("pause"))) {
        this.completeMenu.returnToMenu();
      }
      return;
    }

    if (this._screen === "menu" || this._screen === "pause" || this._screen === "level-select") {
      const menu =
        this._screen === "menu"
          ? this.mainMenu
          : this._screen === "pause"
            ? this.pauseMenu
            : this.levelSelectMenu;
      this.handleListInput(input, menu);
      if (this._screen === "pause" && (input.consumePressed("pause") || input.consumePressed("cancel"))) {
        this.handlePauseMenuAction("resume");
      } else if (
        this._screen === "level-select" &&
        (input.consumePressed("pause") || input.consumePressed("cancel"))
      ) {
        this.setScreen("menu");
      }
      return;
    }

    if (this._screen === "options") {
      if (input.consumePressed("menuUp")) this.optionsMenu.focusNext(-1);
      if (input.consumePressed("menuDown")) this.optionsMenu.focusNext(1);
      if (input.consumePressed("confirm")) this.optionsMenu.activateFocused();
      if (input.consumePressed("cancel") || input.consumePressed("pause")) this.setScreen(this.returnScreen);
      return;
    }

    if (this._screen === "controls" || this._screen === "credits") {
      if (
        input.consumePressed("confirm") ||
        input.consumePressed("cancel") ||
        input.consumePressed("pause")
      ) {
        this.setScreen(this.returnScreen);
      }
    }
  }

  public destroy(): void {
    this.unsubscribeSettings?.();
    this.documentRef.removeEventListener("keydown", this.developerShortcutBound);
    this.mainMenu.destroy();
    this.levelSelectMenu.destroy();
    this.pauseMenu.destroy();
    this.optionsMenu.destroy();
    this.controlsPanel.destroy();
    this.creditsPanel.destroy();
    this.completeMenu.destroy();
    this.hud.destroy();
    this.developerPanel.destroy();
    this.root.remove();
  }

  private handleListInput(
    input: UIInputReader,
    menu: MainMenuUI | PauseMenuUI | LevelSelectUI | LevelCompleteUI
  ): void {
    if (input.consumePressed("menuUp")) menu.selectNext(-1);
    if (input.consumePressed("menuDown")) menu.selectNext(1);
    if (input.consumePressed("confirm")) menu.activateSelected();
  }

  private handleMainMenuAction(action: MainMenuAction): void {
    switch (action) {
      case "start":
        this.callbacks.onStart?.();
        this.setScreen("game");
        break;
      case "level-select":
        this.setScreen("level-select");
        break;
      case "options":
      case "controls":
      case "credits":
        this.returnScreen = "menu";
        this.setScreen(action);
        break;
      case "exit":
        this.callbacks.onExit?.();
        this.notify("EXIT MENU IS NOT AVAILABLE IN A BROWSER");
        break;
    }
  }

  private handlePauseMenuAction(action: PauseMenuAction): void {
    switch (action) {
      case "resume":
        this.callbacks.onResume?.();
        this.setScreen("game");
        break;
      case "restart":
        this.callbacks.onRestart?.();
        this.setScreen("game");
        break;
      case "menu":
        this.setScreen("menu");
        break;
      case "options":
      case "controls":
        this.returnScreen = "pause";
        this.setScreen(action);
        break;
    }
  }

  private createLoadingPanel(): HTMLElement {
    const panel = this.documentRef.createElement("section");
    panel.className = "boot-panel";
    panel.setAttribute("aria-live", "polite");
    const title = this.documentRef.createElement("h1");
    title.textContent = "BALL PILLAR";
    const label = this.documentRef.createElement("p");
    label.textContent = "LOCKING ONTO THE MECHANICAL SIGNAL";
    const progress = this.documentRef.createElement("output");
    progress.textContent = "INITIALIZING WEBGPU // 0%";
    panel.append(title, label, progress);
    return panel;
  }

  private createCompatibilityPanel(): { panel: HTMLElement; message: HTMLElement } {
    const panel = this.documentRef.createElement("section");
    panel.className = "boot-panel compatibility-panel";
    const title = this.documentRef.createElement("h1");
    title.textContent = "WEBGPU REQUIRED";
    const message = this.documentRef.createElement("p");
    message.textContent = "This demo needs a WebGPU-capable browser and device.";
    const guidance = this.documentRef.createElement("p");
    guidance.className = "boot-panel__guidance";
    guidance.textContent = "Try a current Chrome, Edge, or Safari build with hardware acceleration enabled.";
    panel.append(title, message, guidance);
    return { panel, message };
  }

  private handleDeveloperShortcut(event: KeyboardEvent): void {
    if (event.code !== "Backquote" || isTextEntryTarget(event.target)) {
      return;
    }
    event.preventDefault();
    this.toggleDeveloperPanel();
  }
}

export {
  SettingsStore,
  DEFAULT_GAME_SETTINGS,
  SETTINGS_STORAGE_KEY,
  sanitizeGameSettings
} from "./SettingsStore";
export type {
  GameSettings,
  StorageLike,
  AspectMode,
  PixelResolutionMode,
  GraphicsPreset
} from "./SettingsStore";
