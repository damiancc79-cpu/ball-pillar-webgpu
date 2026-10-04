import type { GameSettings } from "./SettingsStore";

export interface OptionsUIOptions {
  document: Document;
  settings: Readonly<GameSettings>;
  onChange: (patch: Partial<GameSettings>) => void;
  onReset: () => void;
  onBack: () => void;
}

type SettingControl = HTMLInputElement | HTMLSelectElement | HTMLButtonElement;

function readableValue(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Audio, display and input settings that remain usable with keyboard focus. */
export class OptionsUI {
  public readonly element: HTMLElement;
  private readonly controls: SettingControl[] = [];
  private readonly ranges = new Map<keyof GameSettings, HTMLInputElement>();
  private readonly rangeReadouts = new Map<keyof GameSettings, HTMLElement>();
  private readonly onChange: (patch: Partial<GameSettings>) => void;
  private settings: Readonly<GameSettings>;
  private selectedIndex = 0;

  public constructor(options: OptionsUIOptions) {
    const { document: documentRef } = options;
    this.settings = { ...options.settings };
    this.onChange = options.onChange;
    this.element = documentRef.createElement("section");
    this.element.className = "menu-panel options-menu";
    this.element.setAttribute("aria-label", "Options");

    const title = documentRef.createElement("h2");
    title.className = "menu-panel__title";
    title.textContent = "OPTIONS";
    const subtitle = documentRef.createElement("p");
    subtitle.className = "menu-panel__subtitle";
    subtitle.textContent = "TUNE THE SIGNAL. SETTINGS SAVE LOCALLY.";
    const content = documentRef.createElement("div");
    content.className = "options-menu__content";

    content.append(
      this.createRange(documentRef, "masterVolume", "MASTER VOLUME", 0, 1, 0.01),
      this.createRange(documentRef, "musicVolume", "MUSIC VOLUME", 0, 1, 0.01),
      this.createRange(documentRef, "sfxVolume", "SFX VOLUME", 0, 1, 0.01),
      this.createRange(documentRef, "ambientVolume", "AMBIENCE", 0, 1, 0.01),
      this.createRange(
        documentRef,
        "renderScale",
        "RENDER SCALE",
        0.5,
        1.5,
        0.05,
        (value) => `${Math.round(value * 100)}%`
      ),
      this.createSelect(documentRef, "pixelResolutionMode", "INTERNAL RESOLUTION", [
        ["native", "NATIVE"],
        ["640x480", "640 × 480"],
        ["320x240", "320 × 240"]
      ]),
      this.createSelect(documentRef, "aspectMode", "ASPECT", [
        ["responsive", "RESPONSIVE"],
        ["4:3", "4:3 CONSOLE"]
      ]),
      this.createRange(documentRef, "cameraSensitivity", "CAMERA SENSITIVITY", 0.2, 3, 0.05),
      this.createRange(documentRef, "gamepadDeadZone", "GAMEPAD DEAD ZONE", 0, 0.75, 0.01)
    );

    const switches = documentRef.createElement("div");
    switches.className = "options-menu__switches";
    switches.append(
      this.createCheckbox(documentRef, "shadowsEnabled", "SHADOWS"),
      this.createCheckbox(documentRef, "fogEnabled", "DISTANCE FOG"),
      this.createCheckbox(documentRef, "ditheringEnabled", "DITHERING"),
      this.createCheckbox(documentRef, "vertexJitterEnabled", "VERTEX JITTER"),
      this.createCheckbox(documentRef, "textureWarpEnabled", "TEXTURE WARP"),
      this.createCheckbox(documentRef, "crtEnabled", "CRT OVERLAY"),
      this.createCheckbox(documentRef, "invertCameraY", "INVERT CAMERA Y"),
      this.createCheckbox(documentRef, "showTimer", "SHOW TIMER")
    );
    content.append(switches);

    const actions = documentRef.createElement("div");
    actions.className = "options-menu__actions";
    const reset = documentRef.createElement("button");
    reset.type = "button";
    reset.className = "ui-button ui-button--muted";
    reset.textContent = "RESET SETTINGS";
    reset.addEventListener("click", options.onReset);
    const back = documentRef.createElement("button");
    back.type = "button";
    back.className = "ui-button";
    back.textContent = "BACK";
    back.addEventListener("click", options.onBack);
    actions.append(reset, back);
    this.controls.push(reset, back);

    this.element.append(title, subtitle, content, actions);
    this.setSettings(options.settings);
  }

  public setVisible(visible: boolean): void {
    this.element.hidden = !visible;
    if (visible) {
      this.focus(this.selectedIndex, false);
    }
  }

  public setSettings(settings: Readonly<GameSettings>): void {
    this.settings = { ...settings };
    for (const [key, control] of this.ranges) {
      const value = this.settings[key];
      if (typeof value === "number") {
        control.value = String(value);
        this.rangeReadouts.get(key)!.textContent = readableValue(value);
      }
    }
    for (const control of this.controls) {
      const key = control.dataset.setting as keyof GameSettings | undefined;
      if (!key) {
        continue;
      }
      const value = this.settings[key];
      if (control instanceof HTMLInputElement && control.type === "checkbox" && typeof value === "boolean") {
        control.checked = value;
      } else if (control instanceof HTMLSelectElement && typeof value === "string") {
        control.value = value;
      }
    }
  }

  public focusNext(direction: 1 | -1, focus = true): void {
    this.focus((this.selectedIndex + direction + this.controls.length) % this.controls.length, focus);
  }

  public activateFocused(): void {
    const control = this.controls[this.selectedIndex];
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      control.checked = !control.checked;
      control.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (control instanceof HTMLSelectElement) {
      control.focus({ preventScroll: true });
      return;
    }
    control?.click();
  }

  public destroy(): void {
    this.element.remove();
  }

  private focus(index: number, focus = true): void {
    this.selectedIndex = Math.max(0, Math.min(this.controls.length - 1, index));
    this.controls.forEach((control, controlIndex) => {
      control.classList.toggle("is-selected", controlIndex === this.selectedIndex);
    });
    if (focus && !this.element.hidden) {
      this.controls[this.selectedIndex]?.focus({ preventScroll: true });
    }
  }

  private createRange(
    documentRef: Document,
    key: Extract<
      keyof GameSettings,
      | "masterVolume"
      | "musicVolume"
      | "sfxVolume"
      | "ambientVolume"
      | "renderScale"
      | "cameraSensitivity"
      | "gamepadDeadZone"
    >,
    labelText: string,
    min: number,
    max: number,
    step: number,
    formatter: (value: number) => string = readableValue
  ): HTMLElement {
    const row = documentRef.createElement("label");
    row.className = "option-row option-row--range";
    const label = documentRef.createElement("span");
    label.textContent = labelText;
    const readout = documentRef.createElement("output");
    readout.className = "option-row__value";
    const input = documentRef.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.dataset.setting = key;
    input.addEventListener("input", () => {
      const value = Number(input.value);
      readout.textContent = formatter(value);
      this.onChange({ [key]: value } as Pick<GameSettings, typeof key>);
    });
    row.append(label, readout, input);
    this.controls.push(input);
    this.ranges.set(key, input);
    this.rangeReadouts.set(key, readout);
    return row;
  }

  private createSelect(
    documentRef: Document,
    key: Extract<keyof GameSettings, "pixelResolutionMode" | "aspectMode">,
    labelText: string,
    values: readonly (readonly [string, string])[]
  ): HTMLElement {
    const row = documentRef.createElement("label");
    row.className = "option-row";
    const label = documentRef.createElement("span");
    label.textContent = labelText;
    const select = documentRef.createElement("select");
    select.dataset.setting = key;
    for (const [value, text] of values) {
      const option = documentRef.createElement("option");
      option.value = value;
      option.textContent = text;
      select.append(option);
    }
    select.addEventListener("change", () => this.onChange({ [key]: select.value } as Partial<GameSettings>));
    row.append(label, select);
    this.controls.push(select);
    return row;
  }

  private createCheckbox(
    documentRef: Document,
    key: Extract<
      keyof GameSettings,
      | "shadowsEnabled"
      | "fogEnabled"
      | "ditheringEnabled"
      | "vertexJitterEnabled"
      | "textureWarpEnabled"
      | "crtEnabled"
      | "invertCameraY"
      | "showTimer"
    >,
    labelText: string
  ): HTMLElement {
    const row = documentRef.createElement("label");
    row.className = "option-toggle";
    const input = documentRef.createElement("input");
    input.type = "checkbox";
    input.dataset.setting = key;
    const label = documentRef.createElement("span");
    label.textContent = labelText;
    input.addEventListener("change", () =>
      this.onChange({ [key]: input.checked } as Pick<GameSettings, typeof key>)
    );
    row.append(input, label);
    this.controls.push(input);
    return row;
  }
}
