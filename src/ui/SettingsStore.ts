export type AspectMode = "responsive" | "4:3";
export type PixelResolutionMode = "native" | "640x480" | "320x240";
export type GraphicsPreset = "performance" | "balanced" | "quality";

export interface GameSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  renderScale: number;
  aspectMode: AspectMode;
  pixelResolutionMode: PixelResolutionMode;
  graphicsPreset: GraphicsPreset;
  shadowsEnabled: boolean;
  fogEnabled: boolean;
  ditheringEnabled: boolean;
  vertexJitterEnabled: boolean;
  textureWarpEnabled: boolean;
  crtEnabled: boolean;
  cameraSensitivity: number;
  gamepadDeadZone: number;
  invertCameraY: boolean;
  showTimer: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SETTINGS_STORAGE_KEY = "ball-pillar-webgpu.settings.v1";

export const DEFAULT_GAME_SETTINGS: Readonly<GameSettings> = Object.freeze({
  masterVolume: 0.86,
  musicVolume: 0.68,
  sfxVolume: 0.86,
  ambientVolume: 0.68,
  renderScale: 0.9,
  aspectMode: "responsive",
  pixelResolutionMode: "640x480",
  graphicsPreset: "balanced",
  shadowsEnabled: true,
  fogEnabled: true,
  ditheringEnabled: true,
  vertexJitterEnabled: false,
  textureWarpEnabled: false,
  crtEnabled: true,
  cameraSensitivity: 1,
  gamepadDeadZone: 0.16,
  invertCameraY: false,
  showTimer: true
});

function getBrowserStorage(): StorageLike | undefined {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch {
    // Storage can be disabled by private-browsing/security policies.
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteInRange(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

function oneOf<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === "string" && (choices as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Safely merges an untrusted persisted object into known, bounded settings. */
export function sanitizeGameSettings(
  value: unknown,
  base: GameSettings = { ...DEFAULT_GAME_SETTINGS }
): GameSettings {
  const input = isRecord(value) ? value : {};
  return {
    masterVolume: finiteInRange(input.masterVolume, base.masterVolume, 0, 1),
    musicVolume: finiteInRange(input.musicVolume, base.musicVolume, 0, 1),
    sfxVolume: finiteInRange(input.sfxVolume, base.sfxVolume, 0, 1),
    ambientVolume: finiteInRange(input.ambientVolume, base.ambientVolume, 0, 1),
    renderScale: finiteInRange(input.renderScale, base.renderScale, 0.5, 1.5),
    aspectMode: oneOf(input.aspectMode, ["responsive", "4:3"], base.aspectMode),
    pixelResolutionMode: oneOf(
      input.pixelResolutionMode,
      ["native", "640x480", "320x240"],
      base.pixelResolutionMode
    ),
    graphicsPreset: oneOf(input.graphicsPreset, ["performance", "balanced", "quality"], base.graphicsPreset),
    shadowsEnabled: booleanValue(input.shadowsEnabled, base.shadowsEnabled),
    fogEnabled: booleanValue(input.fogEnabled, base.fogEnabled),
    ditheringEnabled: booleanValue(input.ditheringEnabled, base.ditheringEnabled),
    vertexJitterEnabled: booleanValue(input.vertexJitterEnabled, base.vertexJitterEnabled),
    textureWarpEnabled: booleanValue(input.textureWarpEnabled, base.textureWarpEnabled),
    crtEnabled: booleanValue(input.crtEnabled, base.crtEnabled),
    cameraSensitivity: finiteInRange(input.cameraSensitivity, base.cameraSensitivity, 0.2, 3),
    gamepadDeadZone: finiteInRange(input.gamepadDeadZone, base.gamepadDeadZone, 0, 0.75),
    invertCameraY: booleanValue(input.invertCameraY, base.invertCameraY),
    showTimer: booleanValue(input.showTimer, base.showTimer)
  };
}

/**
 * Local, versioned settings persistence.  It works in tests and SSR-like
 * environments by accepting an injected storage object and quietly degrading
 * to in-memory settings when storage is unavailable.
 */
export class SettingsStore {
  private readonly storage?: StorageLike;
  private readonly storageKey: string;
  private listeners = new Set<(settings: Readonly<GameSettings>) => void>();
  private current: GameSettings;

  public constructor(
    options: {
      storage?: StorageLike;
      storageKey?: string;
      defaults?: GameSettings;
      autoLoad?: boolean;
    } = {}
  ) {
    this.storage = options.storage ?? getBrowserStorage();
    this.storageKey = options.storageKey ?? SETTINGS_STORAGE_KEY;
    this.current = { ...(options.defaults ?? DEFAULT_GAME_SETTINGS) };
    if (options.autoLoad ?? true) {
      this.load();
    }
  }

  public get settings(): Readonly<GameSettings> {
    return { ...this.current };
  }

  public load(): Readonly<GameSettings> {
    try {
      const raw = this.storage?.getItem(this.storageKey);
      if (raw) {
        this.current = sanitizeGameSettings(JSON.parse(raw), this.current);
      }
    } catch {
      // Malformed or inaccessible storage should never prevent the game booting.
    }
    this.notify();
    return this.settings;
  }

  public update(patch: Partial<GameSettings>, persist = true): Readonly<GameSettings> {
    this.current = sanitizeGameSettings({ ...this.current, ...patch }, this.current);
    if (persist) {
      this.persist();
    }
    this.notify();
    return this.settings;
  }

  public replace(settings: GameSettings, persist = true): Readonly<GameSettings> {
    this.current = sanitizeGameSettings(settings, { ...DEFAULT_GAME_SETTINGS });
    if (persist) {
      this.persist();
    }
    this.notify();
    return this.settings;
  }

  public reset(persist = true): Readonly<GameSettings> {
    this.current = { ...DEFAULT_GAME_SETTINGS };
    if (persist) {
      try {
        this.storage?.removeItem(this.storageKey);
      } catch {
        // Preserve in-memory defaults when the browser blocks storage writes.
      }
    }
    this.notify();
    return this.settings;
  }

  public subscribe(listener: (settings: Readonly<GameSettings>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public persist(): void {
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(this.current));
    } catch {
      // Settings still apply for the current session if persistence fails.
    }
  }

  private notify(): void {
    const snapshot = this.settings;
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
