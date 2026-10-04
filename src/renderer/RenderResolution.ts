import type { GraphicsConfig } from "../config/GraphicsConfig";

export interface RenderSize {
  width: number;
  height: number;
}

export function getRenderSize(
  viewportWidth: number,
  viewportHeight: number,
  config: GraphicsConfig
): RenderSize {
  const targetAspect = config.aspectMode === "4:3" ? 4 / 3 : viewportWidth / viewportHeight;
  const constrainedHeight = Math.min(viewportHeight, viewportWidth / targetAspect);
  const constrainedWidth = constrainedHeight * targetAspect;

  if (config.pixelResolutionMode === "320x240") return { width: 320, height: 240 };
  if (config.pixelResolutionMode === "640x480") return { width: 640, height: 480 };
  return {
    width: Math.max(1, Math.floor(constrainedWidth * config.renderScale)),
    height: Math.max(1, Math.floor(constrainedHeight * config.renderScale))
  };
}

export function getCanvasBounds(
  viewportWidth: number,
  viewportHeight: number,
  aspectMode: GraphicsConfig["aspectMode"]
): RenderSize {
  if (aspectMode === "responsive") return { width: viewportWidth, height: viewportHeight };
  const width = Math.min(viewportWidth, viewportHeight * (4 / 3));
  return { width, height: width / (4 / 3) };
}
