import { describe, expect, it } from "vitest";

import {
  DEFAULT_SURFACE_MATERIAL,
  SURFACE_MATERIALS,
  getSurfaceMaterial,
  isSurfaceMaterialId,
  normalizeSurfaceMaterialId
} from "../physics/SurfaceMaterial";

describe("surface material lookup", () => {
  it("contains all traversal material families with distinct physics properties", () => {
    expect(Object.keys(SURFACE_MATERIALS)).toHaveLength(7);
    expect(SURFACE_MATERIALS.ice.friction).toBeLessThan(SURFACE_MATERIALS.concrete.friction);
    expect(SURFACE_MATERIALS.rubber.restitution).toBeGreaterThan(SURFACE_MATERIALS.concrete.restitution);
  });

  it("normalizes authored camel-case aliases", () => {
    expect(normalizeSurfaceMaterialId("rustedMetal")).toBe("rusted-metal");
    expect(normalizeSurfaceMaterialId("polishedMetal")).toBe("polished-metal");
    expect(normalizeSurfaceMaterialId("sandCoatedMetal")).toBe("sand-coated-metal");
    expect(isSurfaceMaterialId("rustedMetal")).toBe(true);
  });

  it("falls back safely to concrete for missing or unknown data", () => {
    expect(getSurfaceMaterial()).toBe(SURFACE_MATERIALS[DEFAULT_SURFACE_MATERIAL]);
    expect(getSurfaceMaterial("lost-technology")).toBe(SURFACE_MATERIALS[DEFAULT_SURFACE_MATERIAL]);
  });
});
