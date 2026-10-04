export interface RendererCapabilities {
  webgpu: boolean;
  reason?: string;
}

export function getRendererCapabilities(): RendererCapabilities {
  if (typeof navigator === "undefined") {
    return { webgpu: false, reason: "This browser environment does not expose WebGPU." };
  }

  if (!("gpu" in navigator) || !navigator.gpu) {
    return {
      webgpu: false,
      reason:
        "WebGPU is unavailable. Use a current Chromium-based browser with hardware acceleration enabled."
    };
  }

  return { webgpu: true };
}
