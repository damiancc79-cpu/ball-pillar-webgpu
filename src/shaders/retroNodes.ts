import { MeshStandardNodeMaterial } from "three/webgpu";
import { color } from "three/tsl";

/** A small TSL colour quantizer used by low-poly scene materials on the WebGPU path. */
export function createRetroMaterial(hex: string, roughness = 0.75, metalness = 0): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial();
  material.colorNode = color(hex).mul(7).floor().div(7);
  material.roughness = roughness;
  material.metalness = metalness;
  return material;
}
