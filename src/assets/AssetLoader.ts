import { ASSET_MANIFEST, type AssetManifestEntry } from "./AssetManifest";

export class AssetLoader {
  async load(onProgress?: (loaded: number, total: number) => void): Promise<Map<string, AssetManifestEntry>> {
    const assets = new Map<string, AssetManifestEntry>();
    ASSET_MANIFEST.forEach((asset, index) => {
      assets.set(asset.id, asset);
      onProgress?.(index + 1, ASSET_MANIFEST.length);
    });
    return assets;
  }
}
