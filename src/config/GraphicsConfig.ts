export type PixelResolutionMode = "native" | "640x480" | "320x240";
export type AspectMode = "responsive" | "4:3";

export interface GraphicsConfig {
  renderScale: number;
  pixelResolutionMode: PixelResolutionMode;
  aspectMode: AspectMode;
  shadowsEnabled: boolean;
  fogEnabled: boolean;
  ditheringEnabled: boolean;
  vertexJitterEnabled: boolean;
  textureWarpEnabled: boolean;
  crtEnabled: boolean;
}

export const DEFAULT_GRAPHICS_CONFIG: GraphicsConfig = {
  renderScale: 0.9,
  pixelResolutionMode: "640x480",
  aspectMode: "4:3",
  shadowsEnabled: true,
  fogEnabled: true,
  ditheringEnabled: true,
  vertexJitterEnabled: true,
  textureWarpEnabled: true,
  crtEnabled: true
};

export function sanitizeGraphicsConfig(value: Partial<GraphicsConfig>): GraphicsConfig {
  return {
    renderScale: Math.min(1, Math.max(0.45, value.renderScale ?? DEFAULT_GRAPHICS_CONFIG.renderScale)),
    pixelResolutionMode:
      value.pixelResolutionMode === "native" || value.pixelResolutionMode === "320x240"
        ? value.pixelResolutionMode
        : "640x480",
    aspectMode: value.aspectMode === "responsive" ? "responsive" : "4:3",
    shadowsEnabled: value.shadowsEnabled ?? DEFAULT_GRAPHICS_CONFIG.shadowsEnabled,
    fogEnabled: value.fogEnabled ?? DEFAULT_GRAPHICS_CONFIG.fogEnabled,
    ditheringEnabled: value.ditheringEnabled ?? DEFAULT_GRAPHICS_CONFIG.ditheringEnabled,
    vertexJitterEnabled: value.vertexJitterEnabled ?? DEFAULT_GRAPHICS_CONFIG.vertexJitterEnabled,
    textureWarpEnabled: value.textureWarpEnabled ?? DEFAULT_GRAPHICS_CONFIG.textureWarpEnabled,
    crtEnabled: value.crtEnabled ?? DEFAULT_GRAPHICS_CONFIG.crtEnabled
  };
}
