import { AudioManager } from "./AudioManager";

export type MusicState = "menu" | "exploration" | "momentum" | "risk" | "complete" | "silent";

export type MusicLayerName = "exploration" | "momentum" | "risk" | "mechanical";

export interface MusicMix {
  exploration: number;
  momentum: number;
  risk: number;
  mechanical: number;
}

export interface MusicSystemOptions {
  bpm?: number;
  /** Optional decoded Web Audio loop; procedural music remains a safe fallback. */
  loopUrl?: string;
  /** Pre-mixer gain for an optional external loop. */
  loopGain?: number;
  onStateChange?: (state: MusicState, intensity: number) => void;
}

/** A compact bridge from gameplay telemetry to the reactive music mix. */
export interface MusicUpdateInput {
  speed?: number;
  /** Defaults to 14 world units per second when speed is supplied. */
  maxSpeed?: number;
  risk?: boolean;
  completed?: boolean;
  paused?: boolean;
}

interface MusicLayer {
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
}

interface ExternalMusicLoop {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

const LAYER_NAMES: readonly MusicLayerName[] = ["exploration", "momentum", "risk", "mechanical"];

const SILENT_MIX: Readonly<MusicMix> = Object.freeze({
  exploration: 0,
  momentum: 0,
  risk: 0,
  mechanical: 0
});

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * clamp(amount);
}

function cloneMix(mix: MusicMix): MusicMix {
  return { ...mix };
}

/**
 * A lightweight procedural soundtrack with independently crossfaded layers.
 *
 * It deliberately waits for `AudioManager.unlock()` before allocating any
 * Web-Audio nodes. Calling `start()` during boot is therefore safe: it merely
 * records intent until a real user gesture unlocks sound.
 */
export class MusicSystem {
  private readonly audio: AudioManager;
  private readonly bpm: number;
  private readonly loopUrl: string | undefined;
  private readonly loopGain: number;
  private readonly onStateChange: ((state: MusicState, intensity: number) => void) | undefined;
  private readonly layers: Partial<Record<MusicLayerName, MusicLayer>> = {};
  private readonly unsubscribeFromUnlock: () => void;

  private context: AudioContext | undefined;
  private externalLoop: ExternalMusicLoop | undefined;
  private loopBuffer: AudioBuffer | undefined;
  private loopLoadPromise: Promise<AudioBuffer | undefined> | undefined;
  private externalLoopStartPromise: Promise<void> | undefined;
  private externalLoopFailed = false;
  private state: MusicState = "menu";
  private intensity = 0;
  private desiredRunning = false;
  private running = false;
  private paused = false;
  private beatIndex = 0;
  private nextBeatTime = 0;
  private schedulerId: ReturnType<typeof globalThis.setInterval> | undefined;
  private stopTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

  public constructor(audio: AudioManager, options: MusicSystemOptions = {}) {
    this.audio = audio;
    const requestedBpm = options.bpm ?? 136;
    this.bpm = Number.isFinite(requestedBpm) ? clamp(requestedBpm, 70, 220) : 136;
    this.loopUrl = options.loopUrl?.trim() || undefined;
    const requestedLoopGain = options.loopGain ?? 0.72;
    this.loopGain = Number.isFinite(requestedLoopGain) ? clamp(requestedLoopGain) : 0.72;
    this.onStateChange = options.onStateChange;
    this.unsubscribeFromUnlock = this.audio.onUnlocked((context) => {
      if (this.desiredRunning) {
        this.activate(context);
      }
    });
  }

  public get isRunning(): boolean {
    return this.running;
  }

  public get isPaused(): boolean {
    return this.paused;
  }

  public getState(): MusicState {
    return this.state;
  }

  public getIntensity(): number {
    return this.intensity;
  }

  public getMix(): MusicMix {
    return this.mixForState();
  }

  /** Starts playback immediately when audio is unlocked, otherwise arms it. */
  public start(): void {
    this.desiredRunning = true;
    if (this.stopTimer !== undefined) {
      globalThis.clearTimeout(this.stopTimer);
      this.stopTimer = undefined;
    }

    const context = this.audio.getContext();
    if (context) {
      this.activate(context);
    }
  }

  /** Crossfades down and tears down whichever soundtrack is active. */
  public stop(fadeSeconds = 0.18): void {
    this.desiredRunning = false;
    this.clearScheduler();

    if (!this.running) {
      return;
    }

    this.applyMix(SILENT_MIX, fadeSeconds);
    this.applyExternalLoopGain(fadeSeconds);
    if (this.stopTimer !== undefined) {
      globalThis.clearTimeout(this.stopTimer);
    }
    this.stopTimer = globalThis.setTimeout(
      () => {
        this.stopTimer = undefined;
        if (!this.desiredRunning) {
          this.teardownGraph();
        }
      },
      Math.ceil(Math.max(0.01, fadeSeconds) * 1000) + 40
    );
  }

  /** Selects a named mix. Changes are smoothed with a short crossfade. */
  public setState(state: MusicState, crossfadeSeconds = 0.35): void {
    if (this.state === state) {
      return;
    }

    this.state = state;
    this.applyCurrentMix(crossfadeSeconds);
    this.emitStateChange();
  }

  /**
   * Sets a 0..1 momentum value. This can be fed directly from ball speed and
   * controls the amount of bass, percussion, and high-risk material.
   */
  public setIntensity(value: number, crossfadeSeconds = 0.18): void {
    const next = Number.isFinite(value) ? clamp(value) : 0;
    if (Math.abs(next - this.intensity) < 0.001) {
      return;
    }

    this.intensity = next;
    this.applyCurrentMix(crossfadeSeconds);
    this.emitStateChange();
  }

  /** Directly crossfades one or more layers, useful for level-specific music zones. */
  public setLayerMix(mix: Partial<MusicMix>, crossfadeSeconds = 0.2): void {
    const current = this.mixForState();
    const target: MusicMix = {
      exploration: clamp(mix.exploration ?? current.exploration),
      momentum: clamp(mix.momentum ?? current.momentum),
      risk: clamp(mix.risk ?? current.risk),
      mechanical: clamp(mix.mechanical ?? current.mechanical)
    };
    this.applyMix(target, crossfadeSeconds);
  }

  /** Pausing fades music while AudioManager supplies the shared low-pass effect. */
  public setPaused(paused: boolean): void {
    if (this.paused === paused) {
      return;
    }

    this.paused = paused;
    this.audio.setPaused(paused);
    if (!paused && this.context) {
      this.nextBeatTime = this.context.currentTime + 0.05;
    }
    this.applyCurrentMix(paused ? 0.12 : 0.18);
  }

  /** Maps ball speed, risk zones, completion, and pause state to music. */
  public update(input: MusicUpdateInput): void {
    if (typeof input.paused === "boolean") {
      this.setPaused(input.paused);
    }

    if (typeof input.speed === "number") {
      const maximum = Math.max(0.01, input.maxSpeed ?? 14);
      this.setIntensity(Math.abs(input.speed) / maximum);
    }

    if (input.completed) {
      const changed = this.state !== "complete";
      this.setState("complete");
      if (changed) {
        this.cueGoal();
      }
      return;
    }

    if (input.risk || this.intensity > 0.72) {
      this.setState("risk");
    } else if (this.intensity > 0.35) {
      this.setState("momentum");
    } else if (this.state !== "silent") {
      this.setState("exploration");
    }
  }

  /** A small bright confirmation phrase for switches and checkpoints. */
  public cueSuccess(): void {
    const layer = this.layers.momentum ?? this.layers.exploration;
    const context = this.context;
    if (layer && context && this.running) {
      const at = context.currentTime + 0.015;
      this.scheduleTone(layer, at, 523.25, 0.12, 0.1, "triangle", 783.99);
      this.scheduleTone(layer, at + 0.105, 659.25, 0.16, 0.1, "triangle", 987.77);
      return;
    }

    this.audio.playTone({
      bus: "ui",
      frequency: 660,
      duration: 0.12,
      gain: 0.11,
      type: "triangle"
    });
  }

  /** A compact high-energy goal cue that remains safe before unlock. */
  public cueGoal(): void {
    const layer = this.layers.risk ?? this.layers.momentum ?? this.layers.exploration;
    const context = this.context;
    if (layer && context && this.running) {
      const at = context.currentTime + 0.02;
      this.scheduleTone(layer, at, 261.63, 0.18, 0.14, "sawtooth", 392);
      this.scheduleTone(layer, at + 0.12, 392, 0.22, 0.15, "sawtooth", 587.33);
      this.scheduleTone(layer, at + 0.25, 523.25, 0.32, 0.16, "triangle", 1046.5);
      return;
    }

    this.audio.playTone({
      bus: "ui",
      frequency: 523.25,
      duration: 0.25,
      gain: 0.14,
      type: "sawtooth"
    });
  }

  public dispose(): void {
    this.desiredRunning = false;
    this.clearScheduler();
    if (this.stopTimer !== undefined) {
      globalThis.clearTimeout(this.stopTimer);
      this.stopTimer = undefined;
    }
    this.teardownGraph();
    this.unsubscribeFromUnlock();
  }

  private activate(context: AudioContext): void {
    if (this.running && this.context === context) {
      this.applyCurrentMix(0.12);
      const bus = this.audio.getBus("music");
      if (this.externalLoop || this.externalLoopStartPromise) {
        return;
      }
      if (this.loopUrl && !this.externalLoopFailed && bus) {
        this.startExternalLoop(context, bus);
      } else {
        this.startProceduralSoundtrack(context, bus);
      }
      return;
    }

    this.teardownGraph();
    const bus = this.audio.getBus("music");
    if (!bus) {
      return;
    }

    try {
      this.context = context;
      this.running = true;
      this.nextBeatTime = context.currentTime + 0.045;
      this.applyCurrentMix(0);
      if (this.loopUrl && !this.externalLoopFailed) {
        this.startExternalLoop(context, bus);
      } else {
        this.startProceduralSoundtrack(context, bus);
      }
    } catch {
      this.teardownGraph();
    }
  }

  /** Builds the legacy score only when no external loop can be played. */
  private startProceduralSoundtrack(context: AudioContext, bus: GainNode | undefined): void {
    if (!bus || !this.running || this.context !== context || this.layers.exploration) {
      return;
    }

    try {
      for (const name of LAYER_NAMES) {
        this.layers[name] = this.createLayer(context, bus, name);
      }
      this.nextBeatTime = context.currentTime + 0.045;
      this.applyCurrentMix(0);
      this.startScheduler();
    } catch {
      this.teardownGraph();
    }
  }

  /** Fetches and decodes the supplied loop after the user has unlocked sound. */
  private startExternalLoop(context: AudioContext, bus: GainNode): void {
    if (this.externalLoop || this.externalLoopStartPromise || this.externalLoopFailed) {
      return;
    }

    const startPromise = this.loadExternalLoop(context)
      .then((buffer) => {
        if (!buffer) {
          this.externalLoopFailed = true;
          this.startProceduralSoundtrack(context, bus);
          return;
        }
        if (!this.desiredRunning || !this.running || this.context !== context || this.externalLoop) {
          return;
        }

        try {
          const source = context.createBufferSource();
          const gain = context.createGain();
          source.buffer = buffer;
          source.loop = true;
          source.loopStart = 0;
          source.loopEnd = buffer.duration;
          gain.gain.setValueAtTime(0.0001, context.currentTime);
          source.connect(gain);
          gain.connect(bus);
          source.onended = () => {
            this.safeDisconnect(source);
            this.safeDisconnect(gain);
            if (this.externalLoop?.source === source) {
              this.externalLoop = undefined;
              if (this.desiredRunning && this.running && this.context === context) {
                this.externalLoopFailed = true;
                this.startProceduralSoundtrack(context, bus);
              }
            }
          };
          source.start(context.currentTime + 0.02);
          this.externalLoop = { source, gain };
          this.applyCurrentMix(0.08);
        } catch {
          this.externalLoopFailed = true;
          this.startProceduralSoundtrack(context, bus);
        }
      })
      .catch(() => {
        this.externalLoopFailed = true;
        this.startProceduralSoundtrack(context, bus);
      });

    this.externalLoopStartPromise = startPromise;
    void startPromise.finally(() => {
      if (this.externalLoopStartPromise === startPromise) {
        this.externalLoopStartPromise = undefined;
      }
    });
  }

  private async loadExternalLoop(context: AudioContext): Promise<AudioBuffer | undefined> {
    if (this.loopBuffer) {
      return this.loopBuffer;
    }
    if (this.loopLoadPromise) {
      return this.loopLoadPromise;
    }
    const loopUrl = this.loopUrl;
    if (!loopUrl || typeof globalThis.fetch !== "function") {
      return undefined;
    }

    const loadPromise = (async (): Promise<AudioBuffer | undefined> => {
      try {
        const response = await globalThis.fetch(loopUrl);
        if (!response.ok) {
          return undefined;
        }
        const encoded = await response.arrayBuffer();
        const decoded = await context.decodeAudioData(encoded.slice(0));
        this.loopBuffer = decoded;
        return decoded;
      } catch {
        return undefined;
      }
    })();
    this.loopLoadPromise = loadPromise;

    try {
      return await loadPromise;
    } finally {
      if (this.loopLoadPromise === loadPromise) {
        this.loopLoadPromise = undefined;
      }
    }
  }

  private createLayer(context: AudioContext, bus: GainNode, name: MusicLayerName): MusicLayer {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.connect(bus);
    const layer: MusicLayer = { gain, sources: [], nodes: [gain] };

    switch (name) {
      case "exploration":
        this.addContinuousOscillator(layer, context, 55, "sine", 0.055);
        this.addContinuousOscillator(layer, context, 82.41, "triangle", 0.035, -7);
        break;
      case "momentum":
        this.addContinuousOscillator(layer, context, 55, "sawtooth", 0.028);
        this.addContinuousOscillator(layer, context, 110, "square", 0.012, 5);
        break;
      case "risk":
        this.addContinuousOscillator(layer, context, 110, "triangle", 0.024, -9);
        this.addContinuousOscillator(layer, context, 220, "sawtooth", 0.008, 3);
        break;
      case "mechanical":
        this.addMechanicalNoise(layer, context);
        break;
    }

    return layer;
  }

  private addContinuousOscillator(
    layer: MusicLayer,
    context: AudioContext,
    frequency: number,
    type: OscillatorType,
    gainValue: number,
    detune = 0
  ): void {
    const oscillator = context.createOscillator();
    const voiceGain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    oscillator.detune.setValueAtTime(detune, context.currentTime);
    voiceGain.gain.setValueAtTime(gainValue, context.currentTime);
    oscillator.connect(voiceGain);
    voiceGain.connect(layer.gain);
    oscillator.start();
    layer.sources.push(oscillator);
    layer.nodes.push(voiceGain);
  }

  private addMechanicalNoise(layer: MusicLayer, context: AudioContext): void {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    source.buffer = this.createNoiseBuffer(context, 1.4);
    source.loop = true;
    source.playbackRate.setValueAtTime(0.42, context.currentTime);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(360, context.currentTime);
    filter.Q.setValueAtTime(0.8, context.currentTime);
    noiseGain.gain.setValueAtTime(0.075, context.currentTime);
    source.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(layer.gain);
    source.start();
    layer.sources.push(source);
    layer.nodes.push(filter, noiseGain);
  }

  private startScheduler(): void {
    if (this.schedulerId !== undefined || !this.running) {
      return;
    }

    this.scheduleBeats();
    this.schedulerId = globalThis.setInterval(() => this.scheduleBeats(), 80);
  }

  private clearScheduler(): void {
    if (this.schedulerId !== undefined) {
      globalThis.clearInterval(this.schedulerId);
      this.schedulerId = undefined;
    }
  }

  private scheduleBeats(): void {
    const context = this.context;
    if (!context || !this.running || this.paused || this.state === "silent") {
      return;
    }

    if (this.nextBeatTime < context.currentTime - 0.25) {
      this.nextBeatTime = context.currentTime + 0.02;
    }

    const sixteenth = 60 / this.bpm / 4;
    const horizon = context.currentTime + 0.16;
    while (this.nextBeatTime < horizon) {
      this.scheduleBeat(this.nextBeatTime, this.beatIndex % 16);
      this.nextBeatTime += sixteenth;
      this.beatIndex += 1;
    }
  }

  private scheduleBeat(at: number, step: number): void {
    const mix = this.mixForState();
    const exploration = this.layers.exploration;
    const momentum = this.layers.momentum;
    const risk = this.layers.risk;
    const mechanical = this.layers.mechanical;

    if (exploration && mix.exploration > 0.01 && step % 4 === 0) {
      const pitch = step === 8 ? 146.83 : 110;
      this.scheduleTone(exploration, at, pitch, 0.09, 0.055, "triangle", pitch * 1.45);
    }

    if (mechanical && mix.mechanical > 0.01 && step % 4 === 2) {
      this.scheduleNoiseHit(mechanical, at, 0.035, 0.025, 900);
    }

    if (momentum && mix.momentum > 0.01) {
      if (step % 4 === 0) {
        this.scheduleTone(momentum, at, 120, 0.13, 0.14, "sine", 48);
      }
      if (step % 2 === 1) {
        this.scheduleNoiseHit(momentum, at, 0.028, 0.024, 5600);
      }
    }

    if (risk && mix.risk > 0.01) {
      if (step === 4 || step === 12) {
        this.scheduleNoiseHit(risk, at, 0.08, 0.095, 1800);
        this.scheduleTone(risk, at, 190, 0.06, 0.045, "square", 105);
      }
      if (step % 2 === 0) {
        this.scheduleNoiseHit(risk, at + 0.012, 0.024, 0.02, 7200);
      }
    }
  }

  private scheduleTone(
    layer: MusicLayer,
    at: number,
    frequency: number,
    duration: number,
    amplitude: number,
    type: OscillatorType,
    endFrequency?: number
  ): void {
    const context = this.context;
    if (!context) {
      return;
    }

    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const attack = Math.min(0.008, duration * 0.2);
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(Math.max(1, frequency), at);
      if (endFrequency !== undefined && endFrequency > 0) {
        oscillator.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
      }
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(Math.max(0.0001, amplitude), at + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      oscillator.connect(gain);
      gain.connect(layer.gain);
      oscillator.start(at);
      oscillator.stop(at + duration + 0.02);
      oscillator.onended = () => {
        this.safeDisconnect(oscillator);
        this.safeDisconnect(gain);
      };
    } catch {
      // Individual beat events are intentionally non-critical.
    }
  }

  private scheduleNoiseHit(
    layer: MusicLayer,
    at: number,
    duration: number,
    amplitude: number,
    filterFrequency: number
  ): void {
    const context = this.context;
    if (!context) {
      return;
    }

    try {
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = this.createNoiseBuffer(context, duration);
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(filterFrequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(Math.max(0.0001, amplitude), at + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(layer.gain);
      source.start(at);
      source.stop(at + duration + 0.02);
      source.onended = () => {
        this.safeDisconnect(source);
        this.safeDisconnect(filter);
        this.safeDisconnect(gain);
      };
    } catch {
      // Keep the scheduler resilient to restricted implementations.
    }
  }

  private applyCurrentMix(crossfadeSeconds: number): void {
    const useProceduralFallback = !this.loopUrl || this.externalLoopFailed;
    this.applyMix(
      this.paused || !useProceduralFallback || this.state === "silent" ? SILENT_MIX : this.mixForState(),
      crossfadeSeconds
    );
    this.applyExternalLoopGain(crossfadeSeconds);
  }

  /** Keeps the downloaded loop on the shared music bus and out of the SFX mix. */
  private applyExternalLoopGain(crossfadeSeconds: number): void {
    const externalLoop = this.externalLoop;
    if (!externalLoop || !this.context || !this.running) {
      return;
    }

    const target =
      !this.desiredRunning || this.paused || this.state === "silent"
        ? 0
        : this.loopGain * this.loopStateGain();
    this.rampParam(externalLoop.gain.gain, target, crossfadeSeconds);
  }

  /** Slightly opens the primary loop as the game moves from menu to risk. */
  private loopStateGain(): number {
    switch (this.state) {
      case "menu":
        return 0.58;
      case "exploration":
        return lerp(0.72, 0.84, this.intensity);
      case "momentum":
        return lerp(0.82, 0.93, this.intensity);
      case "risk":
        return lerp(0.9, 1, this.intensity);
      case "complete":
        return 0.96;
      case "silent":
        return 0;
    }
  }

  private applyMix(mix: Readonly<MusicMix>, crossfadeSeconds: number): void {
    const context = this.context;
    if (!context || !this.running) {
      return;
    }

    for (const name of LAYER_NAMES) {
      const layer = this.layers[name];
      if (layer) {
        this.rampParam(layer.gain.gain, clamp(mix[name]), crossfadeSeconds);
      }
    }
  }

  private mixForState(): MusicMix {
    const momentum = clamp((this.intensity - 0.25) / 0.65);
    const risk = clamp((this.intensity - 0.62) / 0.38);

    switch (this.state) {
      case "silent":
        return cloneMix(SILENT_MIX);
      case "menu":
        return { exploration: 0.28, momentum: 0, risk: 0, mechanical: 0.2 };
      case "exploration":
        return {
          exploration: lerp(0.52, 0.72, this.intensity),
          momentum: momentum * 0.22,
          risk: 0,
          mechanical: lerp(0.28, 0.4, this.intensity)
        };
      case "momentum":
        return {
          exploration: 0.7,
          momentum: lerp(0.46, 0.86, momentum),
          risk: risk * 0.16,
          mechanical: 0.42
        };
      case "risk":
        return {
          exploration: 0.75,
          momentum: 0.86,
          risk: lerp(0.56, 1, risk),
          mechanical: 0.5
        };
      case "complete":
        return { exploration: 0.8, momentum: 0.92, risk: 0.62, mechanical: 0.35 };
    }
  }

  private rampParam(param: AudioParam, value: number, seconds: number): void {
    const now = this.context?.currentTime ?? 0;
    try {
      param.cancelScheduledValues(now);
      param.setValueAtTime(Math.max(0.0001, param.value), now);
      if (seconds <= 0) {
        param.setValueAtTime(value, now);
      } else {
        param.linearRampToValueAtTime(value, now + seconds);
      }
    } catch {
      param.value = value;
    }
  }

  private createNoiseBuffer(context: AudioContext, duration: number): AudioBuffer {
    const sampleRate = Math.max(8000, context.sampleRate || 44100);
    const frameCount = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = context.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private teardownGraph(): void {
    this.clearScheduler();
    const externalLoop = this.externalLoop;
    if (externalLoop) {
      this.externalLoop = undefined;
      externalLoop.source.onended = null;
      try {
        externalLoop.source.stop();
      } catch {
        // A loop may already have ended while the graph is being released.
      }
      this.safeDisconnect(externalLoop.source);
      this.safeDisconnect(externalLoop.gain);
    }
    for (const name of LAYER_NAMES) {
      const layer = this.layers[name];
      if (!layer) {
        continue;
      }

      for (const source of layer.sources) {
        try {
          source.stop();
        } catch {
          // A source may have already been stopped by context shutdown.
        }
        this.safeDisconnect(source);
      }
      for (const node of layer.nodes) {
        this.safeDisconnect(node);
      }
      delete this.layers[name];
    }
    this.context = undefined;
    this.running = false;
  }

  private emitStateChange(): void {
    try {
      this.onStateChange?.(this.state, this.intensity);
    } catch {
      // Optional UI callbacks should never affect audio scheduling.
    }
  }

  private safeDisconnect(node: AudioNode): void {
    try {
      node.disconnect();
    } catch {
      // Disconnect can throw for a source whose context was already closed.
    }
  }
}
