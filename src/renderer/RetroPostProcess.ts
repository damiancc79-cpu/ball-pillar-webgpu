import type { GraphicsConfig } from "../config/GraphicsConfig";

/** CSS-driven finishing pass so the optional presentation effects stay separate from gameplay rendering. */
export class RetroPostProcess {
  constructor(private readonly root: HTMLElement) {}

  apply(config: GraphicsConfig): void {
    this.root.dataset.crt = String(config.crtEnabled);
    this.root.dataset.dither = String(config.ditheringEnabled);
    this.root.dataset.jitter = String(config.vertexJitterEnabled);
    this.root.dataset.warp = String(config.textureWarpEnabled);
  }
}
