/**
 * The Web Audio gateway for the demo.
 *
 * Nothing in this module creates an AudioContext at import or construction
 * time. Call `unlock()` directly from a click, key, touch, or gamepad gesture
 * before trying to play sounds.
 */

export const AUDIO_SETTINGS_STORAGE_KEY = "ball-pillar-webgpu.audio-settings";

export type AudioBusName = "master" | "music" | "sfx" | "ui" | "ambient";

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  ui: number;
  ambient: number;
  muted: boolean;
}

/** Small storage contract so volume persistence is easy to unit-test. */
export interface AudioStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface AudioManagerOptions {
  /** A custom key is useful for previews and automated tests. */
  storageKey?: string;
  /** Omit this to use browser localStorage when it is available. */
  storage?: AudioStorage;
  /** Values supplied here override locally persisted values. */
  settings?: Partial<AudioSettings>;
  onSettingsChange?: (settings: AudioSettings) => void;
}

export interface ToneOptions {
  bus?: Exclude<AudioBusName, "master"> | "master";
  frequency?: number;
  duration?: number;
  gain?: number;
  attack?: number;
  release?: number;
  delay?: number;
  detune?: number;
  pitchVariation?: number;
  volumeVariation?: number;
  type?: OscillatorType;
}

export interface NoiseOptions {
  bus?: Exclude<AudioBusName, "master"> | "master";
  duration?: number;
  gain?: number;
  attack?: number;
  release?: number;
  delay?: number;
  playbackRate?: number;
  filterType?: BiquadFilterType;
  filterFrequency?: number;
  volumeVariation?: number;
}

export interface NoiseLoopOptions {
  bus?: Exclude<AudioBusName, "master"> | "master";
  gain?: number;
  playbackRate?: number;
  filterType?: BiquadFilterType;
  filterFrequency?: number;
  seconds?: number;
}

export interface SpatialPannerOptions {
  x?: number;
  y?: number;
  z?: number;
  panningModel?: PanningModelType;
  distanceModel?: DistanceModelType;
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
}

export interface AudioPlaybackHandle {
  stop: (fadeSeconds?: number) => void;
}

export interface AudioLoopHandle extends AudioPlaybackHandle {
  setGain: (gain: number, rampSeconds?: number) => void;
  setPlaybackRate: (rate: number, rampSeconds?: number) => void;
}

type AudioContextConstructor = new () => AudioContext;

export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioSettings> = Object.freeze({
  master: 0.82,
  music: 0.6,
  sfx: 0.82,
  ui: 0.72,
  ambient: 0.55,
  muted: false
});

const SECONDARY_BUSES = ["music", "sfx", "ui", "ambient"] as const;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getAudioContextConstructor(): AudioContextConstructor | undefined {
  const audioGlobals = globalThis as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  const constructor = audioGlobals.AudioContext ?? audioGlobals.webkitAudioContext;

  return typeof constructor === "function" ? constructor : undefined;
}

function getStorage(): AudioStorage | undefined {
  try {
    const storage = (globalThis as unknown as { localStorage?: AudioStorage }).localStorage;
    return storage;
  } catch {
    // Storage may be disabled by browser privacy settings or unavailable in tests.
    return undefined;
  }
}

/** Coerces persisted/untrusted data into a complete safe settings object. */
export function normalizeAudioSettings(
  value: unknown,
  fallback: AudioSettings = DEFAULT_AUDIO_SETTINGS
): AudioSettings {
  const candidate = optionalObject(value);

  return {
    master: clamp(finiteNumber(candidate.master, fallback.master)),
    music: clamp(finiteNumber(candidate.music, fallback.music)),
    sfx: clamp(finiteNumber(candidate.sfx, fallback.sfx)),
    ui: clamp(finiteNumber(candidate.ui, fallback.ui)),
    ambient: clamp(finiteNumber(candidate.ambient, fallback.ambient)),
    muted: typeof candidate.muted === "boolean" ? candidate.muted : fallback.muted
  };
}

/**
 * Browser-safe audio buses and tiny procedural SFX helpers.
 *
 * The class intentionally has no static singleton, which keeps it easy to use
 * in a game instance and easy to mock in logic tests.
 */
export class AudioManager {
  private readonly storageKey: string;
  private readonly storage: AudioStorage | undefined;
  private readonly settingsListeners = new Set<(settings: AudioSettings) => void>();
  private readonly unlockListeners = new Set<(context: AudioContext) => void>();
  private readonly busGains: Partial<Record<AudioBusName, GainNode>> = {};

  private settings: AudioSettings;
  private context: AudioContext | undefined;
  private masterFilter: BiquadFilterNode | undefined;
  private unlockPromise: Promise<boolean> | undefined;
  private unlocked = false;
  private paused = false;
  private disposed = false;

  public constructor(options: AudioManagerOptions = {}) {
    this.storageKey = options.storageKey ?? AUDIO_SETTINGS_STORAGE_KEY;
    this.storage = options.storage ?? getStorage();
    this.settings = normalizeAudioSettings(
      { ...this.readPersistedSettings(), ...options.settings },
      DEFAULT_AUDIO_SETTINGS
    );

    if (options.onSettingsChange) {
      this.settingsListeners.add(options.onSettingsChange);
    }
  }

  public static isSupported(): boolean {
    return getAudioContextConstructor() !== undefined;
  }

  /** True only after a successful user-gesture-triggered unlock. */
  public get isUnlocked(): boolean {
    return this.unlocked;
  }

  public get isPaused(): boolean {
    return this.paused;
  }

  /**
   * Creates/resumes the audio context. Invoke this directly in an input event
   * handler; callers should not invoke it during application boot.
   */
  public async unlock(): Promise<boolean> {
    if (this.disposed) {
      return false;
    }

    if (this.unlocked && this.context?.state === "running") {
      return true;
    }

    if (!this.unlockPromise) {
      this.unlockPromise = this.unlockInternal().finally(() => {
        this.unlockPromise = undefined;
      });
    }

    return this.unlockPromise;
  }

  /** Alias that makes gesture-only call sites self-documenting. */
  public unlockFromGesture(): Promise<boolean> {
    return this.unlock();
  }

  public getContext(): AudioContext | undefined {
    return this.unlocked ? this.context : undefined;
  }

  /** Returns an input node for a bus after the context is unlocked. */
  public getBus(bus: AudioBusName): GainNode | undefined {
    return this.unlocked ? this.busGains[bus] : undefined;
  }

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  public getVolume(bus: AudioBusName): number {
    return this.settings[bus];
  }

  public setVolume(bus: AudioBusName, value: number, persist = true): AudioSettings {
    switch (bus) {
      case "master":
        return this.setSettings({ master: value }, persist);
      case "music":
        return this.setSettings({ music: value }, persist);
      case "sfx":
        return this.setSettings({ sfx: value }, persist);
      case "ui":
        return this.setSettings({ ui: value }, persist);
      case "ambient":
        return this.setSettings({ ambient: value }, persist);
    }
  }

  public setMuted(muted: boolean, persist = true): AudioSettings {
    return this.setSettings({ muted }, persist);
  }

  public toggleMuted(persist = true): AudioSettings {
    return this.setMuted(!this.settings.muted, persist);
  }

  /** Applies and optionally persists a partial set of settings. */
  public setSettings(next: Partial<AudioSettings>, persist = true): AudioSettings {
    const normalized = normalizeAudioSettings({ ...this.settings, ...next }, this.settings);
    const changed = JSON.stringify(normalized) !== JSON.stringify(this.settings);
    this.settings = normalized;
    this.applySettings(0.045);

    if (persist) {
      this.persistSettings();
    }

    if (changed) {
      this.emitSettingsChange();
    }

    return this.getSettings();
  }

  /** Re-reads settings without requiring an AudioContext. */
  public reloadSettings(): AudioSettings {
    const persisted = this.readPersistedSettings();
    return this.setSettings(persisted, false);
  }

  public resetSettings(): AudioSettings {
    return this.setSettings(DEFAULT_AUDIO_SETTINGS, true);
  }

  public saveSettings(): void {
    this.persistSettings();
  }

  /** Subscribe to setting changes; the returned function removes the listener. */
  public onSettingsChange(listener: (settings: AudioSettings) => void): () => void {
    this.settingsListeners.add(listener);
    return () => this.settingsListeners.delete(listener);
  }

  /**
   * Subscribe to a successful audio unlock. If it is already unlocked, the
   * listener is invoked immediately so integrations do not need a race check.
   */
  public onUnlocked(listener: (context: AudioContext) => void): () => void {
    this.unlockListeners.add(listener);
    if (this.unlocked && this.context) {
      this.callUnlockListener(listener, this.context);
    }

    return () => this.unlockListeners.delete(listener);
  }

  /** Applies a gentle low-pass effect used by pause menus. */
  public setPaused(paused: boolean): void {
    this.paused = paused;
    this.applyPauseFilter(0.12);
  }

  /**
   * Plays a short oscillator sound. It returns undefined before unlock or on
   * unsupported browsers, making game events safe to fire from shared logic.
   */
  public playTone(options: ToneOptions = {}): AudioPlaybackHandle | undefined {
    const context = this.getContext();
    const bus = this.getBus(options.bus ?? "sfx");
    if (!context || !bus) {
      return undefined;
    }

    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime + Math.max(0, options.delay ?? 0);
      const duration = Math.max(0.012, options.duration ?? 0.12);
      const attack = Math.min(duration * 0.5, Math.max(0.001, options.attack ?? 0.004));
      const release = Math.min(duration * 0.8, Math.max(0.004, options.release ?? 0.07));
      const releaseAt = Math.max(startAt + attack, startAt + duration - release);
      const frequency = Math.max(1, options.frequency ?? 440);
      const pitchRange = Math.max(0, options.pitchVariation ?? 0);
      const gainRange = Math.max(0, options.volumeVariation ?? 0);
      const pitchMultiplier = Math.pow(2, ((Math.random() * 2 - 1) * pitchRange) / 12);
      const amplitude = clamp((options.gain ?? 0.15) * (1 + (Math.random() * 2 - 1) * gainRange));

      oscillator.type = options.type ?? "sine";
      oscillator.frequency.setValueAtTime(frequency * pitchMultiplier, startAt);
      oscillator.detune.setValueAtTime(options.detune ?? 0, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.linearRampToValueAtTime(Math.max(0.0001, amplitude), startAt + attack);
      gain.gain.setValueAtTime(Math.max(0.0001, amplitude), releaseAt);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

      oscillator.connect(gain);
      gain.connect(bus);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.03);

      return this.createPlaybackHandle(context, oscillator, gain, startAt);
    } catch {
      return undefined;
    }
  }

  /** Plays a filtered noise burst, useful for impacts, brakes, and UI texture. */
  public playNoise(options: NoiseOptions = {}): AudioPlaybackHandle | undefined {
    const context = this.getContext();
    const bus = this.getBus(options.bus ?? "sfx");
    if (!context || !bus) {
      return undefined;
    }

    try {
      const duration = Math.max(0.012, options.duration ?? 0.09);
      const source = context.createBufferSource();
      source.buffer = this.createNoiseBuffer(context, duration);
      source.playbackRate.setValueAtTime(Math.max(0.01, options.playbackRate ?? 1), context.currentTime);

      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      const startAt = context.currentTime + Math.max(0, options.delay ?? 0);
      const attack = Math.min(duration * 0.5, Math.max(0.001, options.attack ?? 0.002));
      const release = Math.min(duration * 0.8, Math.max(0.004, options.release ?? 0.05));
      const releaseAt = Math.max(startAt + attack, startAt + duration - release);
      const variation = Math.max(0, options.volumeVariation ?? 0);
      const amplitude = clamp((options.gain ?? 0.12) * (1 + (Math.random() * 2 - 1) * variation));

      filter.type = options.filterType ?? "bandpass";
      filter.frequency.setValueAtTime(Math.max(20, options.filterFrequency ?? 1250), startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.linearRampToValueAtTime(Math.max(0.0001, amplitude), startAt + attack);
      gain.gain.setValueAtTime(Math.max(0.0001, amplitude), releaseAt);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(bus);
      source.start(startAt);
      source.stop(startAt + duration + 0.03);

      return this.createPlaybackHandle(context, source, gain, startAt, filter);
    } catch {
      return undefined;
    }
  }

  /**
   * Creates a controllable looping noise source. It is designed for rolling or
   * machinery sounds, so callers can update gain/rate instead of restarting a
   * source every frame.
   */
  public createNoiseLoop(options: NoiseLoopOptions = {}): AudioLoopHandle | undefined {
    const context = this.getContext();
    const bus = this.getBus(options.bus ?? "ambient");
    if (!context || !bus) {
      return undefined;
    }

    try {
      const source = context.createBufferSource();
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      source.buffer = this.createNoiseBuffer(context, Math.max(0.1, options.seconds ?? 1.25));
      source.loop = true;
      source.playbackRate.setValueAtTime(Math.max(0.01, options.playbackRate ?? 1), context.currentTime);
      filter.type = options.filterType ?? "bandpass";
      filter.frequency.setValueAtTime(Math.max(20, options.filterFrequency ?? 740), context.currentTime);
      gain.gain.setValueAtTime(clamp(options.gain ?? 0.08), context.currentTime);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(bus);
      source.start();

      let stopped = false;
      const stop = (fadeSeconds = 0.05): void => {
        if (stopped) {
          return;
        }
        stopped = true;
        const now = context.currentTime;
        this.rampAudioParam(gain.gain, 0.0001, Math.max(0.005, fadeSeconds));
        try {
          source.stop(now + Math.max(0.01, fadeSeconds) + 0.02);
        } catch {
          // A source may already have ended in a browser implementation.
        }
        source.onended = () => {
          this.safeDisconnect(source);
          this.safeDisconnect(filter);
          this.safeDisconnect(gain);
        };
      };

      return {
        stop,
        setGain: (value, rampSeconds = 0.04) => {
          if (!stopped) {
            this.rampAudioParam(gain.gain, clamp(value), rampSeconds);
          }
        },
        setPlaybackRate: (value, rampSeconds = 0.04) => {
          if (!stopped) {
            this.rampAudioParam(source.playbackRate, Math.max(0.01, value), rampSeconds);
          }
        }
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Creates and connects a positional panner to a bus. Connect a source to the
   * returned node; it will already route through the selected bus.
   */
  public createSpatialPanner(
    options: SpatialPannerOptions = {},
    busName: AudioBusName = "sfx"
  ): PannerNode | undefined {
    const context = this.getContext();
    const bus = this.getBus(busName);
    if (!context || !bus) {
      return undefined;
    }

    try {
      const panner = context.createPanner();
      panner.panningModel = options.panningModel ?? "HRTF";
      panner.distanceModel = options.distanceModel ?? "inverse";
      panner.refDistance = Math.max(0.01, options.refDistance ?? 1);
      panner.maxDistance = Math.max(panner.refDistance, options.maxDistance ?? 80);
      panner.rolloffFactor = Math.max(0, options.rolloffFactor ?? 1.2);
      this.setPannerPosition(panner, options.x ?? 0, options.y ?? 0, options.z ?? 0);
      panner.connect(bus);
      return panner;
    } catch {
      return undefined;
    }
  }

  public setPannerPosition(panner: PannerNode, x: number, y: number, z: number): void {
    const now = this.context?.currentTime ?? 0;
    panner.positionX.setValueAtTime(x, now);
    panner.positionY.setValueAtTime(y, now);
    panner.positionZ.setValueAtTime(z, now);
  }

  /** Closes the context and releases subscriptions. It is safe in test/SSR environments. */
  public async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.unlocked = false;
    this.unlockListeners.clear();
    this.settingsListeners.clear();
    const context = this.context;
    this.context = undefined;
    this.masterFilter = undefined;
    for (const bus of ["master", ...SECONDARY_BUSES] as const) {
      delete this.busGains[bus];
    }

    if (context) {
      try {
        await context.close();
      } catch {
        // Closing an already-closed context is harmless for the game lifecycle.
      }
    }
  }

  private async unlockInternal(): Promise<boolean> {
    const AudioContextClass = getAudioContextConstructor();
    if (!AudioContextClass) {
      return false;
    }

    try {
      if (!this.context) {
        this.context = new AudioContextClass();
        this.createBusGraph(this.context);
      }

      if (this.context.state === "closed") {
        return false;
      }

      if (this.context.state !== "running") {
        await this.context.resume();
      }

      if (this.context.state !== "running") {
        return false;
      }

      this.unlocked = true;
      this.applySettings(0);
      this.applyPauseFilter(0);
      for (const listener of this.unlockListeners) {
        this.callUnlockListener(listener, this.context);
      }
      return true;
    } catch {
      this.unlocked = false;
      return false;
    }
  }

  private createBusGraph(context: AudioContext): void {
    const master = context.createGain();
    const pauseFilter = context.createBiquadFilter();
    pauseFilter.type = "lowpass";
    master.connect(pauseFilter);
    pauseFilter.connect(context.destination);
    this.busGains.master = master;
    this.masterFilter = pauseFilter;

    for (const busName of SECONDARY_BUSES) {
      const bus = context.createGain();
      bus.connect(master);
      this.busGains[busName] = bus;
    }
  }

  private createNoiseBuffer(context: AudioContext, duration: number): AudioBuffer {
    const sampleRate = Math.max(8000, context.sampleRate || 44100);
    const frames = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = context.createBuffer(1, frames, sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;

    for (let index = 0; index < data.length; index += 1) {
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.02 * white) / 1.02;
      data[index] = brown * 3.5;
    }

    return buffer;
  }

  private createPlaybackHandle(
    context: AudioContext,
    source: OscillatorNode | AudioBufferSourceNode,
    gain: GainNode,
    startAt: number,
    extraNode?: AudioNode
  ): AudioPlaybackHandle {
    let stopped = false;
    source.onended = () => {
      this.safeDisconnect(source);
      this.safeDisconnect(extraNode);
      this.safeDisconnect(gain);
    };

    return {
      stop: (fadeSeconds = 0.025): void => {
        if (stopped) {
          return;
        }
        stopped = true;
        const now = Math.max(context.currentTime, startAt);
        const fade = Math.max(0.004, fadeSeconds);
        try {
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
          source.stop(now + fade + 0.01);
        } catch {
          // Manual stop is best-effort and should never interrupt gameplay.
        }
      }
    };
  }

  private applySettings(rampSeconds: number): void {
    const master = this.busGains.master;
    if (master) {
      this.rampAudioParam(master.gain, this.settings.muted ? 0 : this.settings.master, rampSeconds);
    }

    for (const busName of SECONDARY_BUSES) {
      const gain = this.busGains[busName];
      if (gain) {
        this.rampAudioParam(gain.gain, this.settings[busName], rampSeconds);
      }
    }
  }

  private applyPauseFilter(rampSeconds: number): void {
    const context = this.context;
    const filter = this.masterFilter;
    if (!context || !filter) {
      return;
    }

    const ceiling = Math.max(1200, context.sampleRate * 0.5 - 100);
    this.rampAudioParam(filter.frequency, this.paused ? 850 : ceiling, rampSeconds);
  }

  private rampAudioParam(param: AudioParam, value: number, seconds: number): void {
    const now = this.context?.currentTime ?? 0;
    try {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      if (seconds <= 0) {
        param.setValueAtTime(value, now);
      } else {
        param.linearRampToValueAtTime(value, now + seconds);
      }
    } catch {
      // Some lightweight test doubles only expose the `value` field.
      param.value = value;
    }
  }

  private readPersistedSettings(): Partial<AudioSettings> {
    const storage = this.storage;
    if (!storage) {
      return {};
    }

    try {
      const raw = storage.getItem(this.storageKey);
      return raw ? normalizeAudioSettings(JSON.parse(raw), DEFAULT_AUDIO_SETTINGS) : {};
    } catch {
      return {};
    }
  }

  private persistSettings(): void {
    const storage = this.storage;
    if (!storage) {
      return;
    }

    try {
      storage.setItem(this.storageKey, JSON.stringify(this.settings));
    } catch {
      // Persistence is optional; the in-memory setting remains authoritative.
    }
  }

  private emitSettingsChange(): void {
    const snapshot = this.getSettings();
    for (const listener of this.settingsListeners) {
      try {
        listener(snapshot);
      } catch {
        // UI callbacks should not make audio unavailable.
      }
    }
  }

  private callUnlockListener(listener: (context: AudioContext) => void, context: AudioContext): void {
    try {
      listener(context);
    } catch {
      // A failed optional sound system must not break the input gesture.
    }
  }

  private safeDisconnect(node: AudioNode | undefined): void {
    if (!node) {
      return;
    }

    try {
      node.disconnect();
    } catch {
      // Nodes may be disconnected by a stopped source already.
    }
  }
}
