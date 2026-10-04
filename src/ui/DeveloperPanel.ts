export interface DeveloperMetrics {
  fps?: number;
  frameTimeMs?: number;
  physicsSteps?: number;
  drawCalls?: number;
  triangles?: number;
  activeBodies?: number;
  sleepingBodies?: number;
  surface?: string;
  ballSpeed?: number;
  checkpoint?: string;
}

export interface DeveloperTuning {
  gravity: number;
  ballMass: number;
  accelerationTorque: number;
  airControlMultiplier: number;
  brakeStrength: number;
  boostMultiplier: number;
  maxLinearSpeed: number;
  friction: number;
  restitution: number;
  cameraDistance: number;
  cameraSmoothing: number;
  cameraCollisionMargin: number;
  fogDensity: number;
  renderScale: number;
  dithering: boolean;
  vertexJitter: boolean;
  colorQuantization: number;
  musicVolume: number;
  sfxVolume: number;
}

export type DeveloperAction =
  "physics-debug" | "collision-shapes" | "spawn-test-object" | "reset-level" | "export-tuning";

export interface DeveloperPanelOptions {
  document: Document;
  tuning?: Partial<DeveloperTuning>;
  onTuningChange?: (patch: Partial<DeveloperTuning>) => void;
  onAction?: (action: DeveloperAction, tuning: Readonly<DeveloperTuning>) => void;
}

const DEFAULT_TUNING: DeveloperTuning = {
  gravity: -9.81,
  ballMass: 8,
  accelerationTorque: 34,
  airControlMultiplier: 0.3,
  brakeStrength: 8,
  boostMultiplier: 1.55,
  maxLinearSpeed: 22,
  friction: 0.9,
  restitution: 0.08,
  cameraDistance: 15.5,
  cameraSmoothing: 8,
  cameraCollisionMargin: 0.35,
  fogDensity: 0.035,
  renderScale: 0.9,
  dithering: true,
  vertexJitter: false,
  colorQuantization: 8,
  musicVolume: 0.68,
  sfxVolume: 0.86
};

const TUNING_RANGES: readonly {
  key: Exclude<keyof DeveloperTuning, "dithering" | "vertexJitter">;
  label: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "gravity", label: "GRAVITY", min: -30, max: 0, step: 0.1 },
  { key: "ballMass", label: "BALL MASS", min: 1, max: 30, step: 0.5 },
  { key: "accelerationTorque", label: "TORQUE", min: 1, max: 100, step: 1 },
  { key: "airControlMultiplier", label: "AIR CONTROL", min: 0, max: 1, step: 0.05 },
  { key: "brakeStrength", label: "BRAKE", min: 0, max: 25, step: 0.5 },
  { key: "boostMultiplier", label: "BOOST", min: 1, max: 3, step: 0.05 },
  { key: "maxLinearSpeed", label: "MAX SPEED", min: 4, max: 50, step: 1 },
  { key: "friction", label: "FRICTION", min: 0, max: 2, step: 0.05 },
  { key: "restitution", label: "BOUNCE", min: 0, max: 1, step: 0.02 },
  { key: "cameraDistance", label: "CAMERA DIST", min: 2, max: 16, step: 0.25 },
  { key: "cameraSmoothing", label: "CAMERA SMOOTH", min: 0, max: 20, step: 0.5 },
  { key: "cameraCollisionMargin", label: "CAMERA MARGIN", min: 0, max: 2, step: 0.05 },
  { key: "fogDensity", label: "FOG", min: 0, max: 0.15, step: 0.002 },
  { key: "renderScale", label: "RENDER SCALE", min: 0.5, max: 1.5, step: 0.05 },
  { key: "colorQuantization", label: "COLOR STEPS", min: 2, max: 16, step: 1 },
  { key: "musicVolume", label: "MUSIC", min: 0, max: 1, step: 0.01 },
  { key: "sfxVolume", label: "SFX", min: 0, max: 1, step: 0.01 }
];

/** Hidden diagnostic controls for fast scene tuning during development. */
export class DeveloperPanel {
  public readonly element: HTMLElement;
  private readonly metricValues = new Map<keyof DeveloperMetrics, HTMLElement>();
  private readonly rangeInputs = new Map<keyof DeveloperTuning, HTMLInputElement>();
  private readonly tuning: DeveloperTuning;
  private readonly onTuningChange?: (patch: Partial<DeveloperTuning>) => void;
  private readonly onAction?: (action: DeveloperAction, tuning: Readonly<DeveloperTuning>) => void;

  public constructor(options: DeveloperPanelOptions) {
    const { document: documentRef } = options;
    this.tuning = { ...DEFAULT_TUNING, ...options.tuning };
    this.onTuningChange = options.onTuningChange;
    this.onAction = options.onAction;
    this.element = documentRef.createElement("aside");
    this.element.className = "developer-panel";
    this.element.setAttribute("aria-label", "Developer controls");
    this.element.hidden = true;

    const heading = documentRef.createElement("h2");
    heading.textContent = "DEVELOPER SIGNAL";
    const metrics = documentRef.createElement("dl");
    metrics.className = "developer-panel__metrics";
    const metricKeys: readonly [keyof DeveloperMetrics, string][] = [
      ["fps", "FPS"],
      ["frameTimeMs", "FRAME"],
      ["physicsSteps", "STEPS"],
      ["drawCalls", "DRAWS"],
      ["triangles", "TRIS"],
      ["activeBodies", "BODIES"],
      ["sleepingBodies", "SLEEP"],
      ["surface", "SURFACE"],
      ["ballSpeed", "SPEED"],
      ["checkpoint", "CHECKPOINT"]
    ];
    for (const [key, label] of metricKeys) {
      const term = documentRef.createElement("dt");
      term.textContent = label;
      const value = documentRef.createElement("dd");
      value.textContent = "—";
      metrics.append(term, value);
      this.metricValues.set(key, value);
    }

    const controls = documentRef.createElement("div");
    controls.className = "developer-panel__controls";
    for (const definition of TUNING_RANGES) {
      controls.append(this.createRange(documentRef, definition));
    }
    controls.append(
      this.createToggle(documentRef, "dithering", "DITHERING"),
      this.createToggle(documentRef, "vertexJitter", "VERTEX JITTER")
    );

    const actions = documentRef.createElement("div");
    actions.className = "developer-panel__actions";
    const actionLabels: readonly [DeveloperAction, string][] = [
      ["physics-debug", "PHYSICS DEBUG"],
      ["collision-shapes", "COLLIDER SHAPES"],
      ["spawn-test-object", "SPAWN TEST"],
      ["reset-level", "RESET LEVEL"],
      ["export-tuning", "EXPORT JSON"]
    ];
    for (const [action, label] of actionLabels) {
      const button = documentRef.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => this.onAction?.(action, this.getTuning()));
      actions.append(button);
    }
    this.element.append(heading, metrics, controls, actions);
  }

  public get visible(): boolean {
    return !this.element.hidden;
  }

  public setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }

  public toggle(): boolean {
    this.setVisible(!this.visible);
    return this.visible;
  }

  public setMetrics(metrics: DeveloperMetrics): void {
    for (const [key, value] of Object.entries(metrics) as [
      keyof DeveloperMetrics,
      DeveloperMetrics[keyof DeveloperMetrics]
    ][]) {
      const target = this.metricValues.get(key);
      if (!target || value === undefined) {
        continue;
      }
      target.textContent = typeof value === "number" ? this.formatMetric(key, value) : value;
    }
  }

  public setTuning(patch: Partial<DeveloperTuning>, notify = false): void {
    Object.assign(this.tuning, patch);
    for (const [key, input] of this.rangeInputs) {
      const value = this.tuning[key];
      if (typeof value === "boolean") {
        input.checked = value;
      } else {
        input.value = String(value);
      }
    }
    if (notify) {
      this.onTuningChange?.(patch);
    }
  }

  public getTuning(): Readonly<DeveloperTuning> {
    return { ...this.tuning };
  }

  public destroy(): void {
    this.element.remove();
  }

  private createRange(documentRef: Document, definition: (typeof TUNING_RANGES)[number]): HTMLElement {
    const row = documentRef.createElement("label");
    row.className = "developer-panel__range";
    const label = documentRef.createElement("span");
    label.textContent = definition.label;
    const input = documentRef.createElement("input");
    input.type = "range";
    input.min = String(definition.min);
    input.max = String(definition.max);
    input.step = String(definition.step);
    input.value = String(this.tuning[definition.key]);
    const output = documentRef.createElement("output");
    output.textContent = input.value;
    input.addEventListener("input", () => {
      const value = Number(input.value);
      this.tuning[definition.key] = value;
      output.textContent = input.value;
      this.onTuningChange?.({ [definition.key]: value } as Partial<DeveloperTuning>);
    });
    row.append(label, input, output);
    this.rangeInputs.set(definition.key, input);
    return row;
  }

  private createToggle(
    documentRef: Document,
    key: "dithering" | "vertexJitter",
    labelText: string
  ): HTMLElement {
    const row = documentRef.createElement("label");
    row.className = "developer-panel__toggle";
    const input = documentRef.createElement("input");
    input.type = "checkbox";
    input.checked = this.tuning[key];
    const label = documentRef.createElement("span");
    label.textContent = labelText;
    input.addEventListener("change", () => {
      this.tuning[key] = input.checked;
      this.onTuningChange?.({ [key]: input.checked } as Partial<DeveloperTuning>);
    });
    row.append(input, label);
    this.rangeInputs.set(key, input);
    return row;
  }

  private formatMetric(key: keyof DeveloperMetrics, value: number): string {
    if (key === "frameTimeMs") return `${value.toFixed(1)} ms`;
    if (key === "ballSpeed") return value.toFixed(1);
    if (key === "fps") return value.toFixed(0);
    return Math.round(value).toLocaleString();
  }
}
