import { FogExp2 } from "three";
import { GameLoop } from "./GameLoop";
import { GameState } from "./GameState";
import type { GraphicsConfig } from "../config/GraphicsConfig";
import { DEFAULT_GRAPHICS_CONFIG, sanitizeGraphicsConfig } from "../config/GraphicsConfig";
import { InputManager } from "../input/InputManager";
import { PILLARBALL_DNB_LOOP } from "../assets/AssetManifest";
import { CAMPAIGN_LEVELS, getCampaignLevel } from "../level/LevelCatalog";
import type { LevelDefinition, TutorialStepDefinition } from "../level/LevelDefinition";
import { getRendererCapabilities } from "../renderer/RendererCapabilities";
import { RetroPostProcess } from "../renderer/RetroPostProcess";
import { WebGPURendererManager } from "../renderer/WebGPURendererManager";
import { GameScene } from "../scene/GameScene";
import { MainMenuScene } from "../scene/MainMenuScene";
import { SceneManager } from "../scene/SceneManager";
import { AudioManager } from "../audio/AudioManager";
import { MusicSystem } from "../audio/MusicSystem";
import type { DeveloperAction, DeveloperTuning } from "../ui/DeveloperPanel";
import type { GameSettings } from "../ui/SettingsStore";
import { UIManager } from "../ui/UIManager";

function toGraphicsConfig(settings: Readonly<GameSettings>): GraphicsConfig {
  return sanitizeGraphicsConfig({
    ...DEFAULT_GRAPHICS_CONFIG,
    renderScale: settings.renderScale,
    pixelResolutionMode: settings.pixelResolutionMode,
    aspectMode: settings.aspectMode,
    shadowsEnabled: settings.shadowsEnabled,
    fogEnabled: settings.fogEnabled,
    ditheringEnabled: settings.ditheringEnabled,
    vertexJitterEnabled: settings.vertexJitterEnabled,
    textureWarpEnabled: settings.textureWarpEnabled,
    crtEnabled: settings.crtEnabled
  });
}

export class App {
  private readonly state = new GameState();
  private readonly input = new InputManager();
  private readonly audio = new AudioManager();
  private readonly music = new MusicSystem(this.audio, {
    bpm: 120,
    loopUrl: PILLARBALL_DNB_LOOP.url,
    loopGain: 0.72
  });
  private readonly ui: UIManager;
  private readonly finishGestureUnlock: () => void;
  private renderer: WebGPURendererManager | undefined;
  private post: RetroPostProcess | undefined;
  private menu: MainMenuScene | undefined;
  private game: GameScene | undefined;
  private sceneManager: SceneManager | undefined;
  private loop: GameLoop | undefined;
  private lastFrameAt = performance.now();
  private fps = 60;
  private currentGraphics = DEFAULT_GRAPHICS_CONFIG;
  private currentLevel: LevelDefinition = CAMPAIGN_LEVELS[0];
  private tutorialPrompt: string | undefined;
  private loadingLevel = false;

  constructor(private readonly host: HTMLElement) {
    this.ui = new UIManager({ container: host });
    const unlock = (): void => {
      void this.unlockAudio();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    this.finishGestureUnlock = () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }

  async initialize(): Promise<void> {
    this.ui.showLoading(0.08, "CHECKING WEBGPU HARDWARE");
    const capabilities = getRendererCapabilities();
    if (!capabilities.webgpu) {
      this.ui.showCompatibility(capabilities.reason ?? "WebGPU is required to run this demo.");
      return;
    }

    try {
      this.ui.showLoading(0.24, "INITIALIZING WEBGPU RENDERER");
      const initialSettings = this.ui.settings;
      this.currentGraphics = toGraphicsConfig(initialSettings);
      this.renderer = await WebGPURendererManager.create(this.host, this.currentGraphics);
      this.post = new RetroPostProcess(this.host);
      this.post.apply(this.currentGraphics);

      this.ui.showLoading(0.52, "STARTING RAPIER PHYSICS");
      this.menu = new MainMenuScene();
      this.game = await this.createGame(this.currentLevel);
      this.sceneManager = new SceneManager(this.menu, this.game);
      this.configureUiCallbacks();
      this.applySettings(initialSettings);
      this.handleResize();
      this.input.connect();
      this.state.setCheckpoint(this.currentLevel.checkpoints[0]?.name ?? this.currentLevel.name);

      window.addEventListener("resize", this.handleResize);
      // WebGPU builds the first-use material pipelines lazily. Warm both views
      // while the boot panel is still visible so START DEMO never opens on an
      // otherwise empty sky-colour frame.
      this.ui.showLoading(0.68, "WARMING AERIAL GAMEPLAY VIEW");
      this.game.updateVisuals(0, 0);
      await this.renderer.renderer.compileAsync(this.game.scene, this.game.camera);
      this.ui.showLoading(0.82, "CALIBRATING PILLAR NETWORK");
      this.menu.update(0);
      await this.renderer.renderer.compileAsync(this.menu.scene, this.menu.camera);
      this.ui.showLoading(0.94, "PILLAR NETWORK READY");
      this.loop = new GameLoop({
        beforePhysics: (delta) => this.updateInputAndUi(delta),
        physicsStep: (fixedDelta) => this.game?.stepPhysics(fixedDelta),
        afterPhysics: (delta) => this.updateScenes(delta),
        render: () => this.render(),
        isPaused: () => this.state.value.paused
      });
      this.ui.setScreen("menu");
      this.state.setScreen("menu");
      this.loop.start();
    } catch (error) {
      const message = error instanceof Error ? error.message : "WebGPU could not be initialized.";
      this.renderer?.dispose();
      this.renderer = undefined;
      this.ui.showCompatibility(`${message} This demo requires an operational WebGPU device.`);
    }
  }

  dispose(): void {
    this.loop?.stop();
    this.input.dispose();
    this.game?.dispose();
    this.music.dispose();
    this.audio.dispose();
    this.renderer?.dispose();
    this.ui.destroy();
    this.finishGestureUnlock();
    window.removeEventListener("resize", this.handleResize);
  }

  private configureUiCallbacks(): void {
    this.ui.configureCallbacks({
      onStart: () => this.startCurrentLevel(),
      onResume: () => {
        this.state.resume();
        this.game?.pause(false);
      },
      onRestart: () => {
        this.state.start();
        this.state.setCheckpoint(this.currentLevel.checkpoints[0]?.name ?? this.currentLevel.name);
        this.game?.restart();
        this.game?.start();
        this.game?.pause(false);
      },
      onJump: () => this.game?.requestJump(),
      onReset: () => this.game?.resetToCheckpoint(),
      onLevelSelect: (levelId) => {
        void this.loadAndStartLevel(levelId);
      },
      onNextLevel: (levelId) => {
        void this.loadAndStartLevel(levelId);
      },
      onExit: () => {
        this.state.setScreen("menu");
        this.sceneManager?.showMenu();
      },
      onPauseChange: (paused) => {
        if (paused) this.state.pause();
        else this.state.resume();
        this.game?.pause(paused);
      },
      onSettings: (settings) => this.applySettings(settings),
      onDeveloperTuning: (patch) => this.applyDeveloperTuning(patch),
      onDeveloperAction: (action, tuning) => this.handleDeveloperAction(action, tuning)
    });
  }

  private async createGame(level: LevelDefinition): Promise<GameScene> {
    return GameScene.create({
      level,
      audio: this.audio,
      music: this.music,
      callbacks: {
        onCheckpoint: (name) => {
          this.state.setCheckpoint(name);
          this.ui.notify(`CHECKPOINT // ${name}`);
        },
        onFall: () => this.ui.notify("SIGNAL LOST // RECOVERING"),
        onRespawn: () => this.ui.notify("CHECKPOINT RESTORED"),
        onSwitch: (active) => this.ui.notify(active ? "COUNTERWEIGHT LOCKED" : "COUNTERWEIGHT RELEASED"),
        onTutorial: (step, index, total) => this.setTutorialPrompt(step, index, total),
        onGoal: () => {
          this.tutorialPrompt = undefined;
          const nextLevel = this.ui.completeCampaignLevel(this.currentLevel.id);
          this.state.finish();
          this.ui.showComplete(this.currentLevel, nextLevel);
        }
      }
    });
  }

  private startCurrentLevel(): void {
    this.state.start();
    this.state.setCheckpoint(this.currentLevel.checkpoints[0]?.name ?? this.currentLevel.name);
    this.game?.restart();
    this.game?.start();
    this.game?.pause(false);
    this.sceneManager?.showGame();
    void this.unlockAudio();
  }

  private async loadAndStartLevel(levelId: string): Promise<void> {
    const level = getCampaignLevel(levelId);
    const renderer = this.renderer;
    const manager = this.sceneManager;
    if (!level || !renderer || !manager || this.loadingLevel) {
      return;
    }
    if (!this.ui.isCampaignLevelUnlocked(level.id)) {
      this.ui.notify("COURSE LOCKED // COMPLETE THE PREVIOUS SIGNAL");
      return;
    }

    this.loadingLevel = true;
    this.state.pause();
    this.game?.pause(true);
    this.tutorialPrompt = undefined;
    this.ui.showLoading(0.6, `LOADING ${level.name}`);
    let replacement: GameScene | undefined;

    try {
      replacement = await this.createGame(level);
      replacement.updateVisuals(0, 0);
      this.ui.showLoading(0.78, "WARMING SELECTED COURSE");
      await renderer.renderer.compileAsync(replacement.scene, replacement.camera);

      const previous = this.game;
      this.game = replacement;
      this.currentLevel = level;
      manager.setGame(replacement);
      this.applySettings(this.ui.settings);
      this.handleResize();
      previous?.dispose();

      this.state.setCheckpoint(level.checkpoints[0]?.name ?? level.name);
      this.state.start();
      replacement.start();
      replacement.pause(false);
      manager.showGame();
      this.ui.setScreen("game");
      this.ui.notify(`${level.name} // ${level.objective ?? "COURSE READY"}`);
      void this.unlockAudio();
    } catch (error) {
      replacement?.dispose();
      const message = error instanceof Error ? error.message : "The selected course could not be loaded.";
      this.state.setScreen("menu");
      this.ui.setScreen("menu");
      this.ui.notify(`LEVEL LOAD FAILED // ${message}`);
    } finally {
      this.loadingLevel = false;
    }
  }

  private setTutorialPrompt(step: TutorialStepDefinition | undefined, index: number, total: number): void {
    this.tutorialPrompt = step ? `${step.title} // ${step.body}` : undefined;
    if (!step && total > 0 && index >= total) {
      this.ui.notify("TRAINING SIGNAL COMPLETE");
    }
  }

  private updateInputAndUi(delta: number): void {
    this.input.update();
    this.ui.mainMenu.setInputDevice(this.input.activeDevice);
    this.ui.pauseMenu.setInputDevice(this.input.activeDevice);
    this.ui.update(this.input);
    if (this.ui.screen === "menu" && this.state.value.screen !== "menu") {
      this.state.setScreen("menu");
      this.game?.pause(true);
      this.sceneManager?.showMenu();
    }
    this.state.tick(delta);
    const game = this.game;
    if (!game || this.state.value.paused) return;
    const move = this.input.getMoveVector();
    const look = this.input.getCameraVector();
    const jump = this.input.consumePressed("jump");
    game.setInput({
      move,
      lookX: look.x,
      lookY: look.y,
      gamepadLook: this.input.activeDevice === "gamepad",
      brake: this.input.isDown("brake"),
      boost: this.input.isDown("boost"),
      jump,
      precision: this.input.isDown("brake"),
      recenter: this.input.consumePressed("cameraRecenter")
    });
  }

  private updateScenes(delta: number): void {
    const manager = this.sceneManager;
    const game = this.game;
    if (!manager || !game) return;
    manager.update(this.state.value.elapsedSeconds, delta);
    const metrics = game.metrics;
    const now = performance.now();
    const frameDelta = Math.max(0.0001, now - this.lastFrameAt);
    this.lastFrameAt = now;
    this.fps += (1000 / frameDelta - this.fps) * 0.08;
    this.ui.setHUDState({
      speed: metrics.speed,
      checkpoint: this.state.value.checkpointName,
      elapsedSeconds: this.state.value.elapsedSeconds,
      showTimer: this.ui.settings.showTimer,
      prompt:
        this.state.value.screen === "game"
          ? (this.tutorialPrompt ?? this.currentLevel.objective ?? "ROLL // BALANCE // ASCEND")
          : ""
    });
    const rendererInfo = this.renderer?.renderer.info.render;
    this.ui.setDeveloperMetrics({
      fps: this.fps,
      frameTimeMs: frameDelta,
      physicsSteps: this.loop?.physicsSteps ?? 0,
      drawCalls: rendererInfo?.calls,
      triangles: rendererInfo?.triangles,
      activeBodies: metrics.physicsBodies,
      sleepingBodies: metrics.sleepingBodies,
      surface: metrics.surface,
      ballSpeed: metrics.speed,
      checkpoint: metrics.checkpoint
    });
  }

  private render(): void {
    if (!this.renderer || !this.sceneManager) return;
    const active = this.sceneManager.active;
    this.renderer.renderer.render(active.scene, active.camera);
  }

  private applySettings(settings: Readonly<GameSettings>): void {
    this.currentGraphics = toGraphicsConfig(settings);
    this.renderer?.setConfig(this.currentGraphics);
    this.handleResize();
    this.post?.apply(this.currentGraphics);
    if (this.renderer) this.renderer.renderer.shadowMap.enabled = settings.shadowsEnabled;
    if (this.game?.scene.fog instanceof FogExp2)
      this.game.scene.fog.density = settings.fogEnabled ? 0.022 : 0;
    this.input.setCameraSettings({
      mouseSensitivity: 0.012 * settings.cameraSensitivity,
      invertMouseY: settings.invertCameraY,
      invertGamepadY: settings.invertCameraY,
      gamepadDeadZone: settings.gamepadDeadZone
    });
    if (this.game) this.game.chaseCamera.config.mouseSensitivity = 0.11 * settings.cameraSensitivity;
    this.audio.setSettings({
      master: settings.masterVolume,
      music: settings.musicVolume,
      sfx: settings.sfxVolume,
      ambient: settings.ambientVolume
    });
  }

  private applyDeveloperTuning(patch: Partial<DeveloperTuning>): void {
    this.game?.applyTuning(patch);
    if (typeof patch.renderScale === "number") this.ui.setSettings({ renderScale: patch.renderScale });
    if (typeof patch.dithering === "boolean") this.ui.setSettings({ ditheringEnabled: patch.dithering });
    if (typeof patch.vertexJitter === "boolean")
      this.ui.setSettings({ vertexJitterEnabled: patch.vertexJitter });
    if (typeof patch.musicVolume === "number") this.ui.setSettings({ musicVolume: patch.musicVolume });
    if (typeof patch.sfxVolume === "number") this.ui.setSettings({ sfxVolume: patch.sfxVolume });
  }

  private handleDeveloperAction(action: DeveloperAction, tuning: Readonly<DeveloperTuning>): void {
    switch (action) {
      case "reset-level":
        this.game?.restart();
        this.ui.notify("LEVEL RESET");
        break;
      case "spawn-test-object":
        this.game?.spawnTestObject();
        this.ui.notify("TEST OBJECT DEPLOYED");
        break;
      case "physics-debug":
      case "collision-shapes":
        this.game?.setPhysicsDebugVisible(!this.game.physicsDebugVisible);
        this.ui.notify(
          this.game?.physicsDebugVisible ? "COLLISION SHAPES VISIBLE" : "COLLISION SHAPES HIDDEN"
        );
        break;
      case "export-tuning":
        this.downloadTuning(tuning);
        break;
    }
  }

  private async unlockAudio(): Promise<void> {
    const unlocked = await this.audio.unlockFromGesture();
    if (unlocked) this.music.start();
  }

  private downloadTuning(tuning: Readonly<DeveloperTuning>): void {
    const blob = new Blob([JSON.stringify(tuning, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pillarball-tuning.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  private readonly handleResize = (): void => {
    this.renderer?.resize();
    const canvas = this.renderer?.renderer.domElement;
    if (!canvas) return;
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    this.sceneManager?.resize(width, height);
  };
}
