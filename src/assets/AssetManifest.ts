export interface AssetManifestEntry {
  id: string;
  type: "audio" | "texture" | "model" | "font";
  url: string;
  fallback?: string;
}

/**
 * The campaign remains procedural apart from its licensed title music loop.
 * Vite's base URL keeps this path correct when the game is deployed below `/`.
 */
export const PILLARBALL_DNB_LOOP: AssetManifestEntry = {
  id: "pillarball-dnb-120bpm-loop",
  type: "audio",
  url: `${import.meta.env.BASE_URL}assets/audio/pillarball-dnb-120bpm-loop.mp3`
};

/** Central metadata for external runtime assets. */
export const ASSET_MANIFEST: AssetManifestEntry[] = [PILLARBALL_DNB_LOOP];
