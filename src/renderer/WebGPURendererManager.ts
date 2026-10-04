import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { WebGPURenderer } from "three/webgpu";
import type { GraphicsConfig } from "../config/GraphicsConfig";
import { getCanvasBounds, getRenderSize } from "./RenderResolution";

export class WebGPURendererManager {
  readonly renderer: WebGPURenderer;
  private config: GraphicsConfig;

  private constructor(renderer: WebGPURenderer, config: GraphicsConfig) {
    this.renderer = renderer;
    this.config = config;
  }

  static async create(host: HTMLElement, config: GraphicsConfig): Promise<WebGPURendererManager> {
    const renderer = new WebGPURenderer({ antialias: false, alpha: false });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.setAnimationLoop(null);
    await renderer.init();
    if ((renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend !== true) {
      renderer.dispose();
      throw new Error("WebGPU initialization did not produce a WebGPU backend.");
    }

    const manager = new WebGPURendererManager(renderer, config);
    host.append(renderer.domElement);
    manager.resize();
    return manager;
  }

  setConfig(config: GraphicsConfig): void {
    this.config = config;
    this.resize();
  }

  resize(): void {
    const bounds = getCanvasBounds(window.innerWidth, window.innerHeight, this.config.aspectMode);
    const internal = getRenderSize(window.innerWidth, window.innerHeight, this.config);
    const canvas = this.renderer.domElement;
    canvas.style.width = `${Math.floor(bounds.width)}px`;
    canvas.style.height = `${Math.floor(bounds.height)}px`;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(internal.width, internal.height, false);
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
